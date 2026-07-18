"""
Export worker — a dedicated, standalone process (run separately from
main.py's live pose-serving process, via its own PM2 entry) that consumes
video-export jobs from a Redis Streams queue and renders them.

Deliberately NOT part of main.py: export rendering is CPU-bound (OpenCV
frame loop + ffmpeg encode) and, before this queue existed, ran as a
FastAPI BackgroundTask inside the SAME process as live per-participant pose
inference — directly competing with real-time coaching sessions for the
same event loop/GIL on a shared 2-vCPU host. Running exports in a separate
OS process gives them genuine isolation: a slow/heavy export can no longer
make live tracking stutter, and vice versa.

Concurrency is controlled by how many instances of this script run (e.g.
via PM2 `instances`), not by an in-process pool — Redis Streams consumer
groups already load-balance naturally across multiple consumers in the same
group, so scaling up later needs no code change, just a PM2 config bump.
One instance by default: conservative for a shared 2-vCPU host.

Mirrors main.py's pose:commands consumer-group pattern (_ensure_command_group
/ _consume_commands / _handle_command) exactly, applied to a different
stream/group and a different job payload.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

import redis.asyncio as aioredis

from config import settings
from export_renderer import export_annotated_video

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

STREAM_KEY = settings.export_stream_key
GROUP = settings.export_consumer_group


async def _ensure_export_group(redis_client: aioredis.Redis) -> None:
    try:
        await redis_client.xgroup_create(STREAM_KEY, GROUP, id="0", mkstream=True)
        logger.info("Created Redis consumer group %r on stream %r", GROUP, STREAM_KEY)
    except Exception as exc:  # noqa: BLE001 - group-already-exists is expected
        if "BUSYGROUP" not in str(exc):
            logger.error("Failed to create export consumer group: %s", exc)


async def _handle_job(redis_client: aioredis.Redis, message_id: str, fields: dict[Any, Any]) -> None:
    try:
        raw = fields.get("data") or fields.get(b"data")
        if raw is None:
            return
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        job = json.loads(raw)

        job_id = job.get("jobId")
        ref_id = job["refId"]
        logger.info("Export job %s: starting (message %s, refId %s)", job_id, message_id, ref_id)

        # export_annotated_video is a long, fully synchronous/blocking call
        # (requests, cv2, subprocess.wait) — run it off the event loop so a
        # shutdown signal or a stalled Redis connection can still be
        # noticed while a render is in flight, even though this process
        # otherwise has nothing else to do concurrently.
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            export_annotated_video,
            ref_id,
            job["videoUrl"],
            job["keypointsUrl"],
            job["uploadUrl"],
            job["callbackToken"],
            job.get("annotations", []),
            job.get("keypointFormat", "halpe26"),
            job.get("includeSkeleton", False),
            job.get("includeAnnotations", True),
            job.get("callbackUrl"),
            job.get("progressUrl"),
        )
        logger.info("Export job %s: finished", job_id)
    except Exception:
        # export_annotated_video already catches its own errors internally
        # and reports failure via callback_url — this outer catch only
        # covers malformed job payloads (bad JSON, missing required fields)
        # that never made it into export_annotated_video at all.
        logger.exception("Export job message %s: failed before/outside export_annotated_video", message_id)
    finally:
        # Always ack — export_annotated_video never raises (it catches
        # everything internally and reports via callback), so there's no
        # scenario here where leaving a message unacked for redelivery
        # would help; it would just get retried and fail the same way.
        await redis_client.xack(STREAM_KEY, GROUP, message_id)


async def _consume(redis_client: aioredis.Redis) -> None:
    await _ensure_export_group(redis_client)
    consumer_name = f"export-worker-{os.getpid()}"
    logger.info(
        "Export job consumer loop started (consumer=%s, stream=%s, group=%s)",
        consumer_name, STREAM_KEY, GROUP,
    )

    while True:
        try:
            # count=1: one job at a time per instance — concurrency comes
            # from running more instances (see module docstring), not from
            # claiming a batch here.
            results = await redis_client.xreadgroup(
                GROUP,
                consumer_name,
                {STREAM_KEY: ">"},
                count=1,
                block=2000,
            )
        except asyncio.CancelledError:
            break
        except Exception as exc:  # noqa: BLE001 - keep the loop alive across transient errors
            logger.error("Export consumer error: %s", exc)
            await asyncio.sleep(1.0)
            continue

        if not results:
            continue

        for _stream_key, messages in results:
            for message_id, fields in messages:
                await _handle_job(redis_client, message_id, fields)


async def _main() -> None:
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=False)
    logger.info("Export worker connecting to Redis: %s", settings.redis_url)
    try:
        await _consume(redis_client)
    finally:
        await redis_client.close()


if __name__ == "__main__":
    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        pass
