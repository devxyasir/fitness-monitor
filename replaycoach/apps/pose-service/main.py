"""
Pose Detection Service — FastAPI application entry point.

An independent subscriber-only service that processes per-participant
LiveKit tracks for real-time skeleton detection. A crash in this service
MUST NOT affect live video or recording (09 §7, FR-6.4).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

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
_command_consumer_task: asyncio.Task[None] | None = None

# Redis stream that any number of pose-service replicas consume competitively —
# lets pose workers spread across machines instead of being pinned to one
# instance via direct HTTP (FIX_07 §3a).
COMMAND_STREAM_KEY = "pose:commands"
COMMAND_GROUP = "pose-workers"
MAX_COMMAND_RETRIES = 20  # cap requeues so a fully-saturated fleet doesn't loop forever


async def _ensure_command_group(redis_client: aioredis.Redis) -> None:
    try:
        await redis_client.xgroup_create(COMMAND_STREAM_KEY, COMMAND_GROUP, id="0", mkstream=True)
        logger.info("Created Redis consumer group %r on stream %r", COMMAND_GROUP, COMMAND_STREAM_KEY)
    except Exception as exc:  # noqa: BLE001 - group-already-exists is expected
        if "BUSYGROUP" not in str(exc):
            logger.error("Failed to create pose command consumer group: %s", exc)


async def _handle_command(
    redis_client: aioredis.Redis,
    worker_pool: WorkerPool,
    message_id: str,
    fields: dict[Any, Any],
) -> None:
    try:
        raw = fields.get("data") or fields.get(b"data")
        if raw is None:
            return
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")

        command = json.loads(raw)
        action = command.get("action")
        session_id = command.get("sessionId")
        participant_id = command.get("participantId")
        retries = int(command.get("retries", 0))

        if action == "start":
            accepted = await worker_pool.add_worker(session_id, participant_id)
            if not accepted:
                if retries < MAX_COMMAND_RETRIES:
                    requeued = {**command, "retries": retries + 1}
                    await redis_client.xadd(COMMAND_STREAM_KEY, {"data": json.dumps(requeued)})
                    logger.warning(
                        "Pose worker pool at capacity; requeued start for %s:%s (retry %d)",
                        session_id, participant_id, retries + 1,
                    )
                else:
                    logger.error(
                        "Dropping start command for %s:%s after %d retries — no replica has capacity",
                        session_id, participant_id, retries,
                    )
        elif action == "stop":
            await worker_pool.remove_worker(session_id, participant_id)
        else:
            logger.warning("Unknown pose command action: %r", action)
    except Exception:
        logger.exception("Failed to process pose command %s", message_id)
    finally:
        await redis_client.xack(COMMAND_STREAM_KEY, COMMAND_GROUP, message_id)


async def _consume_commands(redis_client: aioredis.Redis, worker_pool: WorkerPool) -> None:
    """Background loop: read start/stop commands competitively with other replicas."""
    await _ensure_command_group(redis_client)
    consumer_name = f"pose-service-{os.getpid()}"
    logger.info("Pose command consumer loop started (consumer=%s)", consumer_name)

    while True:
        try:
            results = await redis_client.xreadgroup(
                COMMAND_GROUP,
                consumer_name,
                {COMMAND_STREAM_KEY: ">"},
                count=10,
                block=2000,
            )
        except asyncio.CancelledError:
            break
        except Exception as exc:  # noqa: BLE001 - keep the loop alive across transient errors
            logger.error("Pose command consumer error: %s", exc)
            await asyncio.sleep(1.0)
            continue

        if not results:
            continue

        for _stream_key, messages in results:
            for message_id, fields in messages:
                await _handle_command(redis_client, worker_pool, message_id, fields)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: initialize model, Redis, worker pool, and the command consumer."""
    global _redis_client, _model, _worker_pool, _command_consumer_task

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

    # Start consuming start/stop commands published by the API (FIX_07 §3a)
    _command_consumer_task = asyncio.create_task(_consume_commands(_redis_client, _worker_pool))

    yield

    # Shutdown
    logger.info("Shutting down pose service...")
    if _command_consumer_task:
        _command_consumer_task.cancel()
        try:
            await _command_consumer_task
        except asyncio.CancelledError:
            pass
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
    """Start inference for a participant's track (local/dev debugging path)."""
    if not _worker_pool:
        return {"status": "error", "message": "Worker pool not initialized"}

    accepted = await _worker_pool.add_worker(session_id, participant_id)
    if not accepted:
        return {"status": "error", "message": "Worker pool at capacity"}
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
