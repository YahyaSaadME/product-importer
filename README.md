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
- API docs: http://localhost:8010/docs

If you run the frontend outside Docker with `npm run dev`, create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8010
```

## Tests

```bash
python -m pytest
```

## Render Deployment

This project is configured for Render Blueprint deployment from Docker Hub images.

1. Log in to Docker Hub locally:

```powershell
docker login
```

2. Replace the image namespace in `render.yaml` with your Docker Hub username or organization:

```powershell
.\scripts\update-render-dockerhub.ps1 -Namespace YOUR_DOCKERHUB_USERNAME
```

3. Build and push the API and frontend images:

```powershell
.\scripts\push-dockerhub.ps1 -Namespace YOUR_DOCKERHUB_USERNAME
```

The frontend image is built with:

```text
NEXT_PUBLIC_API_URL=https://product-importer-api.onrender.com
```

4. Push this repository to GitHub.
5. In Render, create a Blueprint instance from the repository.
6. Render reads `render.yaml`, pulls the two Docker Hub images, and creates the API, frontend web service, Redis-compatible Key Value instance, and PostgreSQL database.

If you use private Docker Hub images, add Docker Hub registry credentials in Render and add `image.creds.fromRegistryCreds` to both image entries in `render.yaml`.

The backend container starts FastAPI and a Celery worker together so uploaded CSV files remain available to the worker on Render. For higher-volume production deployments, move uploads to object storage and split the worker into its own Render service.
