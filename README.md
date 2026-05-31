# Product Importer

A FastAPI + Celery + PostgreSQL + Next.js application for importing large product CSV files, deduplicating by case-insensitive SKU, managing products via a full CRUD UI, and delivering real-time webhook events.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [CSV Format](#csv-format)
- [API Reference](#api-reference)
- [Testing Webhooks Locally](#testing-webhooks-locally)
- [Running Tests](#running-tests)
- [Render Deployment](#render-deployment)

---

## Features

- CSV upload with browser progress bar and real-time import status polling
- Streaming CSV parsing in a Celery worker — API stays responsive during large imports
- Batched PostgreSQL upserts keyed by normalised (case-insensitive) SKU
- Product CRUD with SKU, name, description, and status filters plus pagination
- Bulk product deletion with typed confirmation dialog
- Webhook CRUD: register URLs, choose which events to subscribe to, enable/disable
- Webhook delivery via Celery with last status code, latency, and error recorded per webhook
- Built-in webhook test button (fires `webhook.test` event immediately from the API)
- **Webhook Tester** — a local receiver service with an in-memory request log and a `/history` endpoint
- Docker Compose single-command local startup
- Render blueprint for one-click public deployment

---

## Architecture

```
Browser
  │
  ▼
Next.js frontend  (:3000 / :3001)
  │  REST
  ▼
FastAPI API  (:8010 / :8000 inside Docker)
  │  enqueues tasks
  ▼
Celery worker  (same container in Docker / Render)
  │  reads/writes
  ├─▶ PostgreSQL  (:5432)
  │  broker + backend
  ├─▶ Redis  (:6379)
  │  HTTP POST on events
  └─▶ Webhook endpoints
        └─▶ webhook-tester  (:8001)  ← local catch-all receiver
```

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Compose v2)
- For local frontend dev without Docker: Node.js 18+

---

## Quick Start

```bash
# 1. Clone and enter the repo
git clone <repo-url>
cd Assesment

# 2. Copy the example env file (defaults work out of the box)
cp .env.example .env

# 3. Start all services
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API (Swagger) | http://localhost:8010/docs |
| Webhook Tester | http://localhost:8001 |
| Webhook history | http://localhost:8001/history |

Everything is ready when the frontend loads and `GET /health` returns `{"status":"ok"}`.

---

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed. All variables have working defaults for local Docker Compose use.

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_DB` | `products` | Database name |
| `POSTGRES_USER` | `postgres` | Database user |
| `POSTGRES_PASSWORD` | `postgres` | Database password |
| `DATABASE_URL` | _(derived)_ | SQLAlchemy async connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Celery broker / result backend |
| `API_CORS_ORIGINS` | `http://localhost:3000,...` | Comma-separated allowed origins |
| `UPLOAD_DIR` | `/tmp/product-imports` | Where uploaded CSVs are stored |
| `API_HOST_PORT` | `8010` | Host port for the API |
| `FRONTEND_HOST_PORT` | `3000` | Host port for the frontend |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8010` | API base URL seen by the browser |

---

## CSV Format

`sku` is the only required column. Later rows with the same normalised SKU (lowercased, trimmed) overwrite earlier rows.

```csv
sku,name,description,is_active
ABC-1,Desk Lamp,Matte black finish,true
abc-1,Desk Lamp v2,Updated duplicate — replaces above,true
XYZ-9,Standing Desk,,false
```

Accepted column aliases:

| Field | Accepted names |
|---|---|
| SKU | `sku` |
| Name | `name` |
| Description | `description` |
| Active flag | `is_active`, `active`, `status` |

---

## API Reference

Full interactive docs are at **http://localhost:8010/docs** when the stack is running.

### Imports

| Method | Path | Description |
|---|---|---|
| `POST` | `/imports` | Upload a CSV file — returns a job ID immediately |
| `GET` | `/imports/{job_id}` | Poll import status (`queued` → `running` → `done` / `failed`) |

### Products

| Method | Path | Description |
|---|---|---|
| `GET` | `/products` | List products (filters: `sku`, `name`, `description`, `is_active`; pagination: `page`, `page_size`) |
| `POST` | `/products` | Create a product |
| `PUT` | `/products/{id}` | Update a product |
| `DELETE` | `/products/{id}` | Delete one product |
| `DELETE` | `/products` | Delete all products |

### Webhooks

| Method | Path | Description |
|---|---|---|
| `GET` | `/webhooks` | List all registered webhooks |
| `POST` | `/webhooks` | Register a new webhook |
| `PUT` | `/webhooks/{id}` | Update a webhook |
| `DELETE` | `/webhooks/{id}` | Delete a webhook |
| `POST` | `/webhooks/{id}/test` | Fire a `webhook.test` event immediately |

#### Webhook Events

| Event | Fired when |
|---|---|
| `product.created` | A product is created via `POST /products` |
| `product.updated` | A product is updated via `PUT /products/{id}` |
| `product.deleted` | A product is deleted via `DELETE /products/{id}` |
| `products.cleared` | All products are deleted via `DELETE /products` |
| `webhook.test` | The test button / `POST /webhooks/{id}/test` is used |

#### Webhook Payload Shape

```json
{
  "event": "product.created",
  "payload": { "product_id": 42 }
}
```

---

## Testing Webhooks Locally

The stack includes a **webhook-tester** service — a lightweight FastAPI receiver that logs every incoming request and stores it in memory.

### 1. Register the tester as a webhook

From the frontend UI **or** via curl:

```bash
curl -s -X POST http://localhost:8010/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://webhook-tester:8001/webhook-test",
    "events": ["product.created","product.updated","product.deleted","products.cleared"],
    "enabled": true
  }' | python -m json.tool
```

> **Important:** use `http://webhook-tester:8001` (the Docker service name) as the URL, not `localhost`, so the Celery worker can reach it inside the Docker network.

### 2. Trigger an event

Create a product:

```bash
curl -s -X POST http://localhost:8010/products \
  -H "Content-Type: application/json" \
  -d '{"sku":"TEST-1","name":"Test Product","description":"hello","is_active":true}' \
  | python -m json.tool
```

Or upload a CSV via the frontend.

### 3. Inspect received payloads

```bash
# All received webhooks, newest first
curl -s http://localhost:8001/history | python -m json.tool

# Clear the log
curl -s -X DELETE http://localhost:8001/history
```

You can also open http://localhost:8001/history in your browser.

### Webhook Tester Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhook-test` | Receives a webhook, logs it, returns `{"status":"received"}` |
| `GET` | `/history` | Returns all received payloads (newest first, last 100) |
| `DELETE` | `/history` | Clears the in-memory log |
| `GET` | `/health` | Health check |

---

## Running Tests

```bash
# Requires a running postgres and redis (docker compose up postgres redis)
python -m pytest
```

Or fully isolated:

```bash
docker compose up postgres redis -d
python -m pytest
docker compose down
```

---

## Render Deployment

The project ships a `render.yaml` Render Blueprint. Render builds the Docker images directly from your GitHub repository — **no Docker Hub account required**.

### Services provisioned

| Service | Type | URL |
|---|---|---|
| `product-importer-api` | Web (Docker) | `https://product-importer-api.onrender.com` |
| `product-importer-web` | Web (Docker) | `https://product-importer-web.onrender.com` |
| `product-importer-redis` | Key Value | internal |
| `product-importer-postgres` | PostgreSQL | internal |

### Deploy steps

**1. Push the repository to GitHub.**

Make sure `.env` is **not** committed (it is gitignored). The only secret file you need to push is `.env.example` — Render reads all real values from `render.yaml` and its dashboard.

**2. Create a Blueprint on Render.**

1. Log in to [render.com](https://render.com) and click **New → Blueprint**.
2. Connect your GitHub account and select this repository.
3. Render detects `render.yaml` automatically and shows a preview of the four services.
4. Click **Apply** — Render provisions everything and starts the first build.

**3. Wait for all services to go live.**

Build order matters: Postgres and Redis start first, then the API, then the frontend. First build takes 3–5 minutes.

When the API is live, `https://product-importer-api.onrender.com/health` returns:

```json
{"status": "ok"}
```

**4. Open the app.**

```
https://product-importer-web.onrender.com
```

### Environment variables

All environment variables are set in `render.yaml`. Nothing needs to be configured manually in the Render dashboard.

| Variable | Value on Render |
|---|---|
| `DATABASE_URL` | Auto-injected from the Postgres service |
| `REDIS_URL` | Auto-injected from the Redis service |
| `API_CORS_ORIGINS` | `https://product-importer-web.onrender.com` |
| `UPLOAD_DIR` | `/tmp/product-imports` |
| `NEXT_PUBLIC_API_URL` | `https://product-importer-api.onrender.com` (baked in at build time) |

### Custom domain

If you add a custom domain to either service in the Render dashboard, also update `API_CORS_ORIGINS` on the API service to include the new frontend domain, and redeploy.

### Notes

- **Celery runs in the same container as FastAPI** (`start.sh` starts both). This keeps things simple on the free/starter tier. For high traffic, split the worker into its own Render service and move uploads to object storage (S3/R2).
- **Starter Postgres** on Render has a 1 GB limit and is single-instance (no HA). Upgrade the plan for production workloads.
- **Free-tier services sleep after inactivity.** Upgrade to the Starter plan to keep them always on.
