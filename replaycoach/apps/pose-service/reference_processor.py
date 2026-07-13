"""
Reference video analysis — downloads an externally-hosted (or buffered-clip)
video, runs the same RTMPose pipeline used for live tracks frame-by-frame,
burns the detected skeleton directly onto the video (matching
process_1mp4.py's visualization exactly — see skeleton_drawing.py), and
reports both the annotated video and the raw per-frame keypoints JSON back
to the API via callback/upload.

Runs as a FastAPI background task; failures are reported via the callback so
the API can mark the video 'failed' and still let the coach present the raw
video without a skeleton overlay — a pose failure must never block the
surrounding feature (mirrors the non-fatal contract in worker.py/main.py).
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import time
from pathlib import Path

import cv2
import requests

from config import settings
from inference import PoseModelAdapter
from skeleton_drawing import draw_skeleton

logger = logging.getLogger(__name__)

# How many consecutive missing frames a joint gap can span and still be
# filled in. Longer than this and linear interpolation would be fabricating
# a plausible-looking but likely-wrong trajectory (a real occlusion/turn
# that long deserves to just show as missing, not a straight-line guess).
MAX_INTERPOLATION_GAP_FRAMES = 5


def _interpolate_short_gaps(frames: list[dict]) -> None:
    """
    Batch post-pass over the fully-collected frame list: fills a joint's
    gap of up to MAX_INTERPOLATION_GAP_FRAMES by linearly interpolating
    between the last known-good position before the gap and the next
    known-good position after it.

    This is deliberately separate from (and complements) the online
    per-frame smoothing already applied inside TopDownPoseEstimator (see
    keypoint_smoothing.py), which can only hold the *last* known position
    causally, one frame at a time, because live tracking has no visibility
    into the future. A reference-video job has the entire buffered clip
    available at once, so it can do better: interpolate using BOTH sides of
    the gap, which tracks actual motion through the gap instead of freezing
    in place. Not something the live path can do without buffering ahead,
    which would add real-time latency it can't afford.

    Mutates `frames` in place (each item's "keypoints" list gets synthetic
    entries appended for interpolated joints).
    """
    n = len(frames)
    if n == 0:
        return

    kp_maps: list[dict[str, dict]] = [{kp["name"]: kp for kp in fr["keypoints"]} for fr in frames]
    all_names: set[str] = set()
    for m in kp_maps:
        all_names.update(m.keys())

    filled = 0
    for name in all_names:
        i = 0
        while i < n:
            if name in kp_maps[i]:
                i += 1
                continue
            gap_start = i
            while i < n and name not in kp_maps[i]:
                i += 1
            gap_end = i  # first index after the gap that HAS this joint (or n if it never reappears)

            # A gap touching either edge of the clip has no known point on
            # one side to interpolate from/to — leave it missing rather
            # than extrapolating blind.
            if gap_start == 0 or gap_end >= n:
                continue
            if gap_end - gap_start > MAX_INTERPOLATION_GAP_FRAMES:
                continue

            before = kp_maps[gap_start - 1][name]
            after = kp_maps[gap_end][name]
            span = gap_end - (gap_start - 1)
            for j in range(gap_start, gap_end):
                t = (j - (gap_start - 1)) / span
                interp = {
                    "name": name,
                    "x": before["x"] + t * (after["x"] - before["x"]),
                    "y": before["y"] + t * (after["y"] - before["y"]),
                    # Discounted below either endpoint's real detection —
                    # this position is a synthetic guess, not a detection.
                    "score": min(before["score"], after["score"]) * 0.9,
                }
                kp_maps[j][name] = interp
                frames[j]["keypoints"].append(interp)
                filled += 1

    if filled:
        logger.info("Interpolated %d short keypoint gaps across %d frames", filled, n)

MAX_FRAMES = 1800  # bounds processing time (e.g. 60s @ 30fps, 120s @ 15fps)
# Hard wall-clock budget independent of MAX_FRAMES — per-frame inference time
# isn't constant (shared CPU with live pose workers, host-level contention),
# so a frame-count cap alone can't bound wall-clock time. Without this, a
# slow-but-not-crashed job just leaves the coach staring at "Analyzing..."
# indefinitely with no feedback. Truncates and reports whatever was processed
# so far instead, same as hitting MAX_FRAMES. Raised from 240s as a generous
# ceiling — reference analysis runs its own model (see
# create_reference_model_adapter), independent of whatever live tracking is
# currently sized to.
MAX_PROCESSING_SECONDS = 480
DOWNLOAD_TIMEOUT_S = 60
CALLBACK_TIMEOUT_S = 30
OVERLAY_UPLOAD_TIMEOUT_S = 120
FFMPEG_EXIT_TIMEOUT_S = 60


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


def _start_ffmpeg_writer(output_path: str, width: int, height: int, fps: float) -> subprocess.Popen:
    """
    Pipes raw annotated BGR frames into ffmpeg for H.264 encoding. OpenCV's
    own VideoWriter can't be relied on here — its default MP4 codec
    (mp4v / MPEG-4 Part 2) is not supported by any major browser, so a video
    written that way would silently fail to play in the reference-analysis
    modal. ffmpeg + libx264 with +faststart produces a real, streamable,
    browser-playable MP4.
    """
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", str(fps or 30.0),
        "-i", "-",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        output_path,
    ]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def process_reference_video(
    ref_id: str,
    video_url: str,
    callback_url: str,
    overlay_upload_url: str,
    callback_token: str,
    model: PoseModelAdapter,
    mode: str = "full_body",
    keypoint_format: str = "halpe26",
) -> None:
    """
    Synchronous and CPU-bound by design — FastAPI's BackgroundTasks runs sync
    callables in a thread pool, so this does not block the event loop (the
    live pose worker pool / command consumer keep running normally).

    mode:
      - 'full_body' (Full Body Analysis): burns the skeleton into the video
        pixels and uploads an overlay MP4, as before.
      - 'annotation_tracking' (new primary): produces the keypoints JSON only
        and skips the ffmpeg burn-in — the frontend renders the skeleton and
        joint-attached annotations on canvas layers over the RAW video, so no
        overlay video is needed (and it's much faster).
    """
    burn_overlay = mode != "annotation_tracking"
    local_path: str | None = None
    overlay_path: str | None = None
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

        ffmpeg_proc = None
        if burn_overlay:
            overlay_fd, overlay_path = tempfile.mkstemp(suffix=".mp4")
            os.close(overlay_fd)
            ffmpeg_proc = _start_ffmpeg_writer(overlay_path, width, height, fps)

        frames: list[dict] = []
        frame_index = 0
        start_time = time.monotonic()
        try:
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

                # Full Body Analysis: burn the skeleton into the pixels and
                # pipe to ffmpeg. Annotation Tracking: skip this entirely —
                # the frontend renders skeleton + annotations from the JSON.
                if ffmpeg_proc is not None:
                    kp_by_name = {kp.name: {"x": kp.x, "y": kp.y, "score": kp.score} for kp in result.keypoints}
                    draw_skeleton(frame, kp_by_name, width, height, keypoint_format)
                    ffmpeg_proc.stdin.write(frame.tobytes())

                frames.append({
                    "frameIndex": frame_index,
                    "timestampMs": round((frame_index / fps) * 1000),
                    "keypoints": [
                        {"name": kp.name, "x": kp.x, "y": kp.y, "score": kp.score}
                        for kp in result.keypoints
                    ],
                })
                frame_index += 1
        finally:
            cap.release()
            if ffmpeg_proc is not None:
                if ffmpeg_proc.stdin:
                    ffmpeg_proc.stdin.close()
                try:
                    ffmpeg_proc.wait(timeout=FFMPEG_EXIT_TIMEOUT_S)
                except subprocess.TimeoutExpired:
                    logger.warning("Reference %s: ffmpeg did not exit in time, killing", ref_id)
                    ffmpeg_proc.kill()

        duration_ms = round((frame_index / fps) * 1000) if fps else 0

        # Fills short keypoint gaps by interpolating across the now-fully-
        # buffered frame list — see _interpolate_short_gaps. Only affects
        # the keypoints JSON; a Full Body Analysis overlay is already
        # streamed frame-by-frame into ffmpeg above and can't be rewound,
        # so the burned-in skeleton doesn't benefit from this pass (the
        # primary annotation_tracking mode, which renders entirely from
        # this JSON, gets the full benefit).
        if settings.enable_temporal_smoothing:
            _interpolate_short_gaps(frames)

        # Upload the annotated overlay video (Full Body Analysis only) —
        # non-fatal: if it fails, the coach still gets keypoints + the raw
        # video (ReferenceService.completeProcessing falls back to the raw
        # video when overlayVideoKey is absent).
        overlay_uploaded = False
        if burn_overlay and overlay_path and frame_index > 0 and os.path.exists(overlay_path) and os.path.getsize(overlay_path) > 0:
            try:
                with open(overlay_path, "rb") as f:
                    up_resp = requests.post(
                        overlay_upload_url,
                        files={"file": ("overlay.mp4", f, "video/mp4")},
                        headers={"X-Callback-Token": callback_token},
                        timeout=OVERLAY_UPLOAD_TIMEOUT_S,
                    )
                up_resp.raise_for_status()
                overlay_uploaded = True
            except Exception:
                logger.exception("Reference %s: failed to upload overlay video", ref_id)

        payload = {
            "status": "ready",
            "keypoints": {
                "fps": fps,
                "frameCount": frame_index,
                "width": width,
                "height": height,
                "keypointFormat": keypoint_format,
                "frames": frames,
            },
            "fps": fps,
            "frameCount": frame_index,
            "width": width,
            "height": height,
            "durationMs": duration_ms,
            "keypointFormat": keypoint_format,
            "overlayUploaded": overlay_uploaded,
        }
        logger.info(
            "Reference %s: processed %d frames (mode=%s, overlay_uploaded=%s), posting callback",
            ref_id, frame_index, mode, overlay_uploaded,
        )

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
        if overlay_path and os.path.exists(overlay_path):
            try:
                os.remove(overlay_path)
            except OSError:
                pass

    try:
        resp = requests.post(
            callback_url,
            json=payload,
            headers={"X-Callback-Token": callback_token},
            timeout=CALLBACK_TIMEOUT_S,
        )
        # Must check the status explicitly — requests doesn't raise on 4xx/5xx
        # by default, so a rejected callback (e.g. payload-too-large) would
        # otherwise look identical to success and leave the video stuck on
        # 'processing' forever with no error anywhere in this service's logs.
        resp.raise_for_status()
    except Exception:
        logger.exception("Reference %s: failed to post completion callback", ref_id)
