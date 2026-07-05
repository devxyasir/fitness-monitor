"""
Pose Detection Service — FastAPI application entry point.

An independent subscriber-only service that processes per-participant
LiveKit tracks for real-time skeleton detection. A crash in this service
MUST NOT affect live video or recording (09 §7, FR-6.4).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import redis.asyncio as aioredis
from fastapi import FastAPI

from config import settings
from inference import PoseModelAdapter, create_model_adapter
from worker import WorkerPool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Module-level references initialized during lifespan
_redis_client: aioredis.Redis | None = None
_model: PoseModelAdapter | None = None
_worker_pool: WorkerPool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: initialize model, Redis, and worker pool."""
    global _redis_client, _model, _worker_pool

    # Initialize ONNX model
    _model = create_model_adapter()
    _model.load()
    logger.info("Pose model initialized and loaded")

    # Initialize Redis connection
    _redis_client = aioredis.from_url(
        settings.redis_url,
        decode_responses=False,
    )
    logger.info("Redis connection established: %s", settings.redis_url)

    # Initialize worker pool
    _worker_pool = WorkerPool(_redis_client, _model)

    yield

    # Shutdown
    logger.info("Shutting down pose service...")
    if _worker_pool:
        await _worker_pool.shutdown()
    if _redis_client:
        await _redis_client.close()


app = FastAPI(
    title="ReplayCoach Pose Detection Service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Basic health check — always returns OK if the process is running."""
    return {"status": "ok"}


@app.get("/ready")
async def ready() -> dict[str, str | bool]:
    """
    Readiness check — returns OK only if model and Redis are initialized.
    Used by load balancers / orchestrators to gate traffic.
    """
    model_ready = _model is not None
    redis_ready = _redis_client is not None

    if model_ready and redis_ready:
        return {"status": "ok", "model": True, "redis": True}

    return {"status": "not_ready", "model": model_ready, "redis": redis_ready}


@app.post("/workers/{session_id}/{participant_id}/start")
async def start_worker(session_id: str, participant_id: str) -> dict[str, str]:
    """Start inference for a participant's track."""
    if not _worker_pool:
        return {"status": "error", "message": "Worker pool not initialized"}

    await _worker_pool.add_worker(session_id, participant_id)
    return {"status": "ok"}


@app.post("/workers/{session_id}/{participant_id}/stop")
async def stop_worker(session_id: str, participant_id: str) -> dict[str, str]:
    """Stop inference for a participant's track."""
    if not _worker_pool:
        return {"status": "error", "message": "Worker pool not initialized"}

    await _worker_pool.remove_worker(session_id, participant_id)
    return {"status": "ok"}


@app.get("/workers")
async def list_workers() -> dict[str, list[str]]:
    """List active worker keys for monitoring."""
    if not _worker_pool:
        return {"workers": []}

    return {"workers": list(_worker_pool._workers.keys())}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8100,
        reload=False,
    )
