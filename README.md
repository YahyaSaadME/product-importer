# Product Importer

A FastAPI + Celery + PostgreSQL + Next.js application for importing large product CSV files, deduplicating by case-insensitive SKU, managing products, clearing the catalog, and testing webhooks.

## Features

- CSV upload with browser upload progress and import status polling.
- Streaming CSV parsing in Celery so the API remains responsive.
- Batched PostgreSQL upserts keyed by normalized SKU.
- Product CRUD with SKU, name, description, status filters, and pagination.
- Bulk product deletion with typed confirmation.
- Webhook CRUD and test calls with response status and latency.
- Docker Compose for local single-command startup.
- Render blueprint for public deployment from one repository.

## CSV Format

`sku` is required. `name`, `description`, and `is_active`/`active`/`status` are optional.

```csv
sku,name,description
ABC-1,Desk lamp,Matte black
abc-1,Desk lamp updated,Later duplicate replaces earlier row
```

## Local Development

```bash
docker compose up --build
```

Then open:

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs

## Tests

```bash
python -m pytest
```

## Render Deployment

1. Push this repository to GitHub.
2. In Render, create a Blueprint instance from the repository.
3. Render reads `render.yaml` and creates the API, Next.js web service, Redis, and PostgreSQL.
4. After the services are created, update `API_CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` if Render generated different service URLs.

The backend container starts FastAPI and a Celery worker together so uploaded CSV files remain available to the worker on Render. For higher-volume production deployments, move uploads to object storage and split the worker into its own Render service.
