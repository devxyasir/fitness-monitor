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
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import settings
from inference import PoseModelAdapter, create_model_adapter, create_reference_model_adapter
from reference_processor import process_reference_video
from export_renderer import export_annotated_video
from worker import WorkerPool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Module-level references initialized during lifespan
_redis_client: aioredis.Redis | None = None
_model: PoseModelAdapter | None = None
_reference_model: PoseModelAdapter | None = None
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
    global _redis_client, _model, _reference_model, _worker_pool, _command_consumer_task

    # Initialize ONNX model (live per-participant tracking — real-time, so
    # sized for speed)
    _model = create_model_adapter()
    _model.load()
    logger.info("Pose model initialized and loaded")

    # Separate, independently-sized model for one-off reference-video
    # analysis (not latency-sensitive — see create_reference_model_adapter).
    # Loaded eagerly at startup so the first upload isn't slowed by a cold
    # model load.
    _reference_model = create_reference_model_adapter()
    _reference_model.load()
    logger.info("Reference-video pose model initialized and loaded")

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


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all so an unexpected exception in any endpoint returns the same
    {"status": "error", "message": ...} shape as every other error response
    in this service, with a real 500, instead of FastAPI's default bare
    "Internal Server Error" text body. Endpoint-specific errors (HTTPException,
    Pydantic 422s) are handled by FastAPI's own machinery before this ever
    runs — this only catches what nothing else did.
    """
    logger.error("Unhandled exception on %s %s: %s", _request.method, _request.url.path, exc, exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"status": "error", "message": "Internal server error"},
    )


@app.get("/health")
async def health() -> dict[str, str]:
    """Basic health check — always returns OK if the process is running."""
    return {"status": "ok"}


@app.get("/ready")
async def ready() -> dict[str, str | bool]:
    """
    Readiness check — returns OK only if both models actually loaded a
    usable ONNX session (not just "the constructor ran") and Redis is
    initialized. Used by load balancers / orchestrators to gate traffic.

    Previously only checked `_model is not None` — but create_model_adapter()
    always returns a constructed adapter object even when load() failed to
    download/open the actual ONNX file (see PoseModelAdapter.is_loaded's
    docstring); that adapter then silently returns empty PoseResult() on
    every inference forever. /ready would report "ok" the whole time. Now
    checks is_loaded so that failure mode actually shows up somewhere.
    """
    model_ready = _model is not None and _model.is_loaded
    reference_model_ready = _reference_model is not None and _reference_model.is_loaded
    redis_ready = _redis_client is not None

    if model_ready and reference_model_ready and redis_ready:
        return {"status": "ok", "model": True, "referenceModel": True, "redis": True}

    return {
        "status": "not_ready",
        "model": model_ready,
        "referenceModel": reference_model_ready,
        "redis": redis_ready,
    }


@app.post("/workers/{session_id}/{participant_id}/start")
async def start_worker(session_id: str, participant_id: str) -> dict[str, str]:
    """Start inference for a participant's track (local/dev debugging path).

    Previously returned {"status": "error", ...} with an implicit HTTP 200
    on both failure branches below — indistinguishable from success at the
    transport level unless a caller specifically parsed the body. Now
    raises a real HTTPException with a status code that matches the
    failure (503: not ready yet: 409: a real, expected "try again" state).
    """
    if not _worker_pool:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Worker pool not initialized")

    accepted = await _worker_pool.add_worker(session_id, participant_id)
    if not accepted:
        raise HTTPException(status.HTTP_409_CONFLICT, "Worker pool at capacity")
    return {"status": "ok"}


@app.post("/workers/{session_id}/{participant_id}/stop")
async def stop_worker(session_id: str, participant_id: str) -> dict[str, str]:
    """Stop inference for a participant's track."""
    if not _worker_pool:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Worker pool not initialized")

    await _worker_pool.remove_worker(session_id, participant_id)
    return {"status": "ok"}


@app.get("/workers")
async def list_workers() -> dict[str, list[str]]:
    """List active worker keys for monitoring."""
    if not _worker_pool:
        return {"workers": []}

    return {"workers": list(_worker_pool._workers.keys())}


class ReferenceProcessRequest(BaseModel):
    refId: str
    videoUrl: str
    callbackUrl: str
    overlayUploadUrl: str
    callbackToken: str
    # 'full_body' (burn skeleton into an overlay MP4, the legacy Full Body
    # Analysis) or 'annotation_tracking' (produce keypoints JSON only; the
    # frontend renders skeleton + joint annotations on canvas over raw video).
    mode: str = "full_body"


@app.post("/reference/process")
async def process_reference(
    req: ReferenceProcessRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """
    Accept a reference-video analysis request and process it in the
    background — long videos can take a while, so the API is notified via
    callback (req.callbackUrl) rather than by polling this response.
    Non-fatal by design: a missing model or processing failure reports
    status='failed' via callback instead of raising, so the coach can still
    present the raw video without a skeleton overlay.
    """
    if not _reference_model or not _reference_model.is_loaded:
        # Reject upfront with a real status code, rather than silently
        # accepting a job whose model never actually loaded — that job
        # would previously "succeed" and produce a video with zero
        # keypoints on every frame instead of failing clearly (see
        # PoseModelAdapter.is_loaded).
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Reference pose model not ready")

    background_tasks.add_task(
        process_reference_video,
        req.refId,
        req.videoUrl,
        req.callbackUrl,
        req.overlayUploadUrl,
        req.callbackToken,
        _reference_model,
        req.mode,
        settings.reference_keypoint_format,
    )
    return {"status": "accepted"}


class ReferenceExportRequest(BaseModel):
    refId: str
    videoUrl: str
    keypointsUrl: str
    uploadUrl: str
    callbackToken: str
    annotations: list[dict]
    keypointFormat: str = "halpe26"
    includeSkeleton: bool = False
    includeAnnotations: bool = True
    # Optional — if the API didn't send one (older client), export_annotated_video
    # just logs on failure instead of posting anywhere, same as before this field
    # existed. When present, a failure gets reported instead of silently vanishing.
    callbackUrl: str | None = None
    # Optional — periodic {"percent": N} progress callbacks are skipped
    # entirely if not provided (older client / local direct-HTTP testing).
    progressUrl: str | None = None


@app.post("/reference/export")
async def export_reference(
    req: ReferenceExportRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """
    Render raw video + skeleton and/or tracked joint-attached annotations
    into an MP4 and upload it (req.uploadUrl). Background task; the API
    polls/serves the exported file for download once uploaded.

    This direct-HTTP path is the local/dev debugging entrypoint (mirrors
    the /workers/* vs pose:commands stream split already used for live
    tracking) — production export requests go through the durable
    pose:export-jobs Redis Streams queue instead (see export_worker.py),
    which is what actually gives export rendering process-level isolation
    from this process's live pose inference.
    """
    background_tasks.add_task(
        export_annotated_video,
        req.refId,
        req.videoUrl,
        req.keypointsUrl,
        req.uploadUrl,
        req.callbackToken,
        req.annotations,
        req.keypointFormat,
        req.includeSkeleton,
        req.includeAnnotations,
        req.callbackUrl,
        req.progressUrl,
    )
    return {"status": "accepted"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8100,
        reload=False,
    )
