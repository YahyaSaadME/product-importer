import shutil
import uuid
from pathlib import Path
from time import perf_counter

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .celery_app import celery_app
from .database import Base, async_engine, get_db
from .imports import normalize_sku
from .models import ImportJob, Product, Webhook
from .schemas import (
    ImportJobRead,
    ProductCreate,
    ProductPage,
    ProductRead,
    ProductUpdate,
    WebhookCreate,
    WebhookRead,
    WebhookTestResult,
    WebhookUpdate,
)
from .settings import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup() -> None:
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    async with async_engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/imports", response_model=ImportJobRead, status_code=status.HTTP_202_ACCEPTED)
async def upload_import(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)) -> ImportJob:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a CSV file.")

    job_id = str(uuid.uuid4())
    target = settings.upload_dir / f"{job_id}.csv"
    with target.open("wb") as handle:
        shutil.copyfileobj(file.file, handle)

    job = ImportJob(id=job_id, filename=Path(file.filename).name, status="queued", stage="Queued")
    db.add(job)
    await db.commit()
    await db.refresh(job)
    celery_app.send_task("app.tasks.import_products", args=[job_id, str(target)])
    return job


@app.get("/imports/{job_id}", response_model=ImportJobRead)
async def get_import(job_id: str, db: AsyncSession = Depends(get_db)) -> ImportJob:
    job = await db.get(ImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found.")
    return job


def _product_filters(
    sku: str | None, name: str | None, description: str | None, is_active: bool | None
) -> list[object]:
    filters: list[object] = []
    if sku:
        filters.append(Product.sku_normalized.ilike(f"%{normalize_sku(sku)}%"))
    if name:
        filters.append(Product.name.ilike(f"%{name.strip()}%"))
    if description:
        filters.append(Product.description.ilike(f"%{description.strip()}%"))
    if is_active is not None:
        filters.append(Product.is_active.is_(is_active))
    return filters


@app.get("/products", response_model=ProductPage)
async def list_products(
    sku: str | None = None,
    name: str | None = None,
    description: str | None = None,
    status_filter: bool | None = Query(default=None, alias="is_active"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> ProductPage:
    filters = _product_filters(sku, name, description, status_filter)
    base_query = select(Product)
    count_query = select(func.count(Product.id))
    for item in filters:
        base_query = base_query.where(item)
        count_query = count_query.where(item)

    total = await db.scalar(count_query)
    result = await db.scalars(
        base_query.order_by(Product.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    return ProductPage(items=list(result), total=total or 0, page=page, page_size=page_size)


@app.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(payload: ProductCreate, db: AsyncSession = Depends(get_db)) -> Product:
    sku_normalized = normalize_sku(payload.sku)
    existing = await db.scalar(select(Product).where(Product.sku_normalized == sku_normalized))
    if existing:
        raise HTTPException(status_code=409, detail="A product with this SKU already exists.")

    product = Product(**payload.model_dump(), sku_normalized=sku_normalized)
    db.add(product)
    await db.commit()
    await db.refresh(product)
    celery_app.send_task("app.tasks.deliver_webhooks", args=["product.created", {"product_id": product.id}])
    return product


@app.put("/products/{product_id}", response_model=ProductRead)
async def update_product(product_id: int, payload: ProductUpdate, db: AsyncSession = Depends(get_db)) -> Product:
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    data = payload.model_dump(exclude_unset=True)
    if "sku" in data:
        normalized = normalize_sku(data["sku"])
        duplicate = await db.scalar(
            select(Product).where(Product.sku_normalized == normalized, Product.id != product_id)
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="A product with this SKU already exists.")
        product.sku_normalized = normalized

    for key, value in data.items():
        setattr(product, key, value)

    await db.commit()
    await db.refresh(product)
    celery_app.send_task("app.tasks.deliver_webhooks", args=["product.updated", {"product_id": product.id}])
    return product


@app.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: int, db: AsyncSession = Depends(get_db)) -> None:
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    await db.delete(product)
    await db.commit()
    celery_app.send_task("app.tasks.deliver_webhooks", args=["product.deleted", {"product_id": product_id}])


@app.delete("/products", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_products(db: AsyncSession = Depends(get_db)) -> None:
    await db.execute(delete(Product))
    await db.commit()
    celery_app.send_task("app.tasks.deliver_webhooks", args=["products.cleared", {}])


@app.get("/webhooks", response_model=list[WebhookRead])
async def list_webhooks(db: AsyncSession = Depends(get_db)) -> list[Webhook]:
    return list(await db.scalars(select(Webhook).order_by(Webhook.updated_at.desc())))


@app.post("/webhooks", response_model=WebhookRead, status_code=status.HTTP_201_CREATED)
async def create_webhook(payload: WebhookCreate, db: AsyncSession = Depends(get_db)) -> Webhook:
    webhook = Webhook(url=str(payload.url), events=payload.events, enabled=payload.enabled)
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)
    return webhook


@app.put("/webhooks/{webhook_id}", response_model=WebhookRead)
async def update_webhook(webhook_id: int, payload: WebhookUpdate, db: AsyncSession = Depends(get_db)) -> Webhook:
    webhook = await db.get(Webhook, webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found.")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(webhook, key, str(value) if key == "url" else value)
    await db.commit()
    await db.refresh(webhook)
    return webhook


@app.delete("/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(webhook_id: int, db: AsyncSession = Depends(get_db)) -> None:
    webhook = await db.get(Webhook, webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found.")
    await db.delete(webhook)
    await db.commit()


@app.post("/webhooks/{webhook_id}/test", response_model=WebhookTestResult)
async def test_webhook(webhook_id: int, db: AsyncSession = Depends(get_db)) -> WebhookTestResult:
    webhook = await db.get(Webhook, webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found.")

    started = perf_counter()
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.post(
                webhook.url,
                json={"event": "webhook.test", "payload": {"message": "Product Importer test"}},
            )
        webhook.last_status_code = response.status_code
        webhook.last_response_ms = int((perf_counter() - started) * 1000)
        webhook.last_error = None
        await db.commit()
        return WebhookTestResult(
            status_code=response.status_code,
            response_ms=webhook.last_response_ms,
            ok=response.is_success,
        )
    except httpx.HTTPError as exc:
        webhook.last_status_code = None
        webhook.last_response_ms = int((perf_counter() - started) * 1000)
        webhook.last_error = str(exc)
        await db.commit()
        return WebhookTestResult(
            status_code=None,
            response_ms=webhook.last_response_ms,
            ok=False,
            error=str(exc),
        )
