"""
Reference video analysis — downloads an externally-hosted (or buffered-clip)
video, runs the same RTMPose pipeline used for live tracks frame-by-frame,
and reports a keypoints-per-frame JSON back to the API via callback.

Runs as a FastAPI background task; failures are reported via the callback so
the API can mark the video 'failed' and still let the coach present the raw
video without a skeleton overlay — a pose failure must never block the
surrounding feature (mirrors the non-fatal contract in worker.py/main.py).
"""

from __future__ import annotations

import logging
import os
import tempfile
import time
from pathlib import Path

import cv2
import requests

from inference import PoseModelAdapter

logger = logging.getLogger(__name__)

MAX_FRAMES = 1800  # bounds processing time (e.g. 60s @ 30fps, 120s @ 15fps)
# Hard wall-clock budget independent of MAX_FRAMES — per-frame inference time
# isn't constant (shared CPU with live pose workers, host-level contention),
# so a frame-count cap alone can't bound wall-clock time. Without this, a
# slow-but-not-crashed job just leaves the coach staring at "Analyzing..."
# indefinitely with no feedback. Truncates and reports whatever was processed
# so far instead, same as hitting MAX_FRAMES.
MAX_PROCESSING_SECONDS = 240
DOWNLOAD_TIMEOUT_S = 60
CALLBACK_TIMEOUT_S = 30


def _download_video(video_url: str) -> str:
    """Download the video to a temp file; returns the local path."""
    suffix = Path(video_url.split("?")[0]).suffix or ".mp4"
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    with requests.get(video_url, stream=True, timeout=DOWNLOAD_TIMEOUT_S) as resp:
        resp.raise_for_status()
        with open(path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                if chunk:
                    f.write(chunk)
    return path


def process_reference_video(
    ref_id: str,
    video_url: str,
    callback_url: str,
    callback_token: str,
    model: PoseModelAdapter,
) -> None:
    """
    Synchronous and CPU-bound by design — FastAPI's BackgroundTasks runs sync
    callables in a thread pool, so this does not block the event loop (the
    live pose worker pool / command consumer keep running normally).
    """
    local_path: str | None = None
    payload: dict

    try:
        logger.info("Reference %s: downloading %s", ref_id, video_url)
        local_path = _download_video(video_url)

        cap = cv2.VideoCapture(local_path)
        if not cap.isOpened():
            raise RuntimeError("Could not open downloaded video")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frame_count_hint = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        logger.info(
            "Reference %s: fps=%.2f size=%dx%d frames~=%d",
            ref_id, fps, width, height, frame_count_hint,
        )

        frames: list[dict] = []
        frame_index = 0
        start_time = time.monotonic()
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if frame_index >= MAX_FRAMES:
                logger.warning("Reference %s: hit MAX_FRAMES cap (%d), truncating", ref_id, MAX_FRAMES)
                break
            if time.monotonic() - start_time > MAX_PROCESSING_SECONDS:
                logger.warning(
                    "Reference %s: hit wall-clock budget (%ds) at frame %d, truncating",
                    ref_id, MAX_PROCESSING_SECONDS, frame_index,
                )
                break

            result = model.infer(frame, track_id=ref_id)
            frames.append({
                "frameIndex": frame_index,
                "timestampMs": round((frame_index / fps) * 1000),
                "keypoints": [
                    {"name": kp.name, "x": kp.x, "y": kp.y, "score": kp.score}
                    for kp in result.keypoints
                ],
            })
            frame_index += 1

        cap.release()

        duration_ms = round((frame_index / fps) * 1000) if fps else 0
        payload = {
            "status": "ready",
            "keypoints": {
                "fps": fps,
                "frameCount": frame_index,
                "width": width,
                "height": height,
                "frames": frames,
            },
            "fps": fps,
            "frameCount": frame_index,
            "width": width,
            "height": height,
            "durationMs": duration_ms,
        }
        logger.info("Reference %s: processed %d frames, posting callback", ref_id, frame_index)

    except Exception as exc:  # noqa: BLE001 - report failure, never raise into the caller
        logger.exception("Reference %s: processing failed", ref_id)
        payload = {"status": "failed", "reason": str(exc)}

    finally:
        # Drop any tracked bbox state for this video — it's a one-shot job,
        # never revisited, so leaving it around would just leak memory.
        model.reset_track(ref_id)
        if local_path and os.path.exists(local_path):
            try:
                os.remove(local_path)
            except OSError:
                pass

    try:
        requests.post(
            callback_url,
            json=payload,
            headers={"X-Callback-Token": callback_token},
            timeout=CALLBACK_TIMEOUT_S,
        )
    except Exception:
        logger.exception("Reference %s: failed to post completion callback", ref_id)
