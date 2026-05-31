from collections import deque
from datetime import datetime, timezone

from fastapi import FastAPI, Request, Response
import uvicorn

app = FastAPI(title="Webhook Tester")

# Keep last 100 received requests in memory
_history: deque[dict] = deque(maxlen=100)


@app.post("/webhook-test")
async def receive_webhook(request: Request) -> dict:
    body = await request.body()
    try:
        payload = await request.json()
    except Exception:
        payload = body.decode()

    entry = {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "method": request.method,
        "headers": dict(request.headers),
        "payload": payload,
    }
    _history.appendleft(entry)
    print(f"[webhook-tester] {entry['received_at']} — {payload}", flush=True)
    return {"status": "received", "payload": payload}


@app.get("/history")
async def get_history() -> list[dict]:
    """Return all received webhook payloads, newest first."""
    return list(_history)


@app.delete("/history", status_code=204)
async def clear_history() -> Response:
    _history.clear()
    return Response(status_code=204)


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
