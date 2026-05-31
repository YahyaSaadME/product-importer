from pathlib import Path
from time import perf_counter

import requests
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from .celery_app import celery_app
from .database import Base, SyncSessionLocal, sync_engine
from .imports import count_csv_rows, read_product_batches
from .models import ImportJob, Product, Webhook
from .settings import get_settings

settings = get_settings()


def _set_job(job_id: str, **values: object) -> None:
    with SyncSessionLocal() as session:
        session.execute(update(ImportJob).where(ImportJob.id == job_id).values(**values))
        session.commit()


def _emit_event(event_type: str, payload: dict[str, object]) -> None:
    celery_app.send_task("app.tasks.deliver_webhooks", args=[event_type, payload])


@celery_app.task(name="app.tasks.import_products")
def import_products(job_id: str, csv_path: str) -> None:
    Base.metadata.create_all(bind=sync_engine)
    path = Path(csv_path)
    processed = 0

    try:
        _set_job(job_id, status="running", stage="Parsing CSV", total_rows=count_csv_rows(path), error=None)

        with SyncSessionLocal() as session:
            for batch in read_product_batches(path, settings.csv_batch_size):
                statement = insert(Product).values(batch)
                upsert = statement.on_conflict_do_update(
                    index_elements=[Product.sku_normalized],
                    set_={
                        "sku": statement.excluded.sku,
                        "name": statement.excluded.name,
                        "description": statement.excluded.description,
                        "is_active": statement.excluded.is_active,
                    },
                )
                session.execute(upsert)
                session.commit()
                session.expunge_all()
                processed += len(batch)
                # Update progress every 10 000 rows to avoid hammering the DB
                if processed % 10_000 < settings.csv_batch_size:
                    _set_job(job_id, stage="Importing products", processed_rows=processed)

        _set_job(job_id, status="complete", stage="Import complete", processed_rows=processed)
        _emit_event("products.imported", {"job_id": job_id, "processed_rows": processed})
    except Exception as exc:  # Celery should persist the human-readable reason on the job.
        _set_job(job_id, status="failed", stage="Import failed", error=str(exc), processed_rows=processed)
        raise
    finally:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


@celery_app.task(name="app.tasks.deliver_webhooks")
def deliver_webhooks(event_type: str, payload: dict[str, object]) -> None:
    with SyncSessionLocal() as session:
        webhooks = session.scalars(
            select(Webhook).where(Webhook.enabled.is_(True), Webhook.events.contains([event_type]))
        ).all()

        for webhook in webhooks:
            started = perf_counter()
            try:
                response = requests.post(
                    webhook.url,
                    json={"event": event_type, "payload": payload},
                    timeout=8,
                    headers={"User-Agent": "product-importer/1.0"},
                )
                webhook.last_status_code = response.status_code
                webhook.last_response_ms = int((perf_counter() - started) * 1000)
                webhook.last_error = None
            except requests.RequestException as exc:
                webhook.last_status_code = None
                webhook.last_response_ms = int((perf_counter() - started) * 1000)
                webhook.last_error = str(exc)
        session.commit()
