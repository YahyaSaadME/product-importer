#!/bin/sh
set -e

celery -A app.celery_app.celery_app worker --loglevel=INFO --concurrency="${CELERY_CONCURRENCY:-2}" &
CELERY_PID=$!

term_handler() {
  kill "$CELERY_PID" 2>/dev/null || true
  wait "$CELERY_PID" 2>/dev/null || true
  exit 0
}

trap term_handler TERM INT

uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
