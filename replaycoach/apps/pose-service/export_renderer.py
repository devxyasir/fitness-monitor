"""
Annotation-tracking export renderer.

Takes a raw video + its keypoints JSON + a list of joint-attached
annotations, and renders a browser-playable MP4 with the coach's skeleton
and/or annotations burned in (independently toggleable) — resolving each
annotation's joints from the keypoints per frame (no re-inference, no pixel
tracking).

Encoding is single-pass: decoded/annotated frames are piped straight into
one ffmpeg process (raw BGR24 over stdin), which encodes directly to
browser-playable H.264 and muxes in the original audio (if any) in the same
pass. The previous design wrote an intermediate mp4v file via
cv2.VideoWriter, then ran a *second*, full ffmpeg re-encode just to make it
browser-playable — two full encodes for one export. This is one.
"""

from __future__ import annotations

import logging
import math
import os
import subprocess
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np
import requests

from config import settings
from skeleton_drawing import draw_skeleton

logger = logging.getLogger(__name__)

DOWNLOAD_TIMEOUT_S = 60
UPLOAD_TIMEOUT_S = 120
PROGRESS_TIMEOUT_S = 5

# Timeout for ffmpeg's final flush/finalize once stdin is closed — NOT the
# whole encode (that now happens continuously, streamed, while the Python
# frame loop runs, not after it). 120s is ample margin for flushing
# buffered frames and writing the moov atom (-movflags +faststart) even for
# a long recording, since the bulk of the actual encoding work already
# happened during frame-writing.
FFMPEG_FINALIZE_TIMEOUT_S = 120

# Wall-clock budget for the per-frame Python/OpenCV draw loop itself, same
# pattern as reference_processor.py's MAX_PROCESSING_SECONDS — that one
# caps at 480s because reference clips are short uploads; this path renders
# full session recordings (up to ~90min), so the budget is larger, but the
# principle is identical: truncate gracefully with a clear log line rather
# than let a CPU-starved box hang a background task forever.
MAX_PROCESSING_SECONDS = 900

# Same threshold as skeleton_drawing.py's own MIN_SCORE (config-driven,
# POSE_SKELETON_MIN_SCORE) — previously a second, independently-hardcoded
# 0.3 here that could silently drift out of sync with the skeleton layer's.
MIN_SCORE = settings.skeleton_min_score

# Progress reports are throttled by BOTH a minimum percent-bucket jump AND a
# minimum time interval (AND, not OR) — a short clip can cross many percent
# buckets in milliseconds (time-gate suppresses the burst); a long clip's
# percent can crawl for a while even as real time passes (percent-gate
# means we don't report "no progress" as if it were progress). Only report
# when both have genuinely moved.
PROGRESS_PERCENT_STEP = 5


def _hex_to_bgr(color: str) -> tuple[int, int, int]:
    """'#RRGGBB' → (B, G, R) for OpenCV. Falls back to red on bad input."""
    try:
        c = color.lstrip("#")
        r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
        return (b, g, r)
    except Exception:
        return (0, 0, 255)


def _download(url: str, suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    with requests.get(url, stream=True, timeout=DOWNLOAD_TIMEOUT_S) as resp:
        resp.raise_for_status()
        with open(path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                if chunk:
                    f.write(chunk)
    return path


def _pt(kp: dict | None, w: int, h: int) -> tuple[int, int] | None:
    if not kp or kp.get("score", 0) < MIN_SCORE:
        return None
    return (int(kp["x"] * w), int(kp["y"] * h))


def _draw_joint_marker(frame: np.ndarray, pt: tuple[int, int], color: tuple[int, int, int], thickness: int) -> None:
    """Draw a styled joint marker matching the editor: dark outline + white fill."""
    cv2.circle(frame, pt, 6, (42, 23, 15), 1, cv2.LINE_AA)
    cv2.circle(frame, pt, 5, (255, 255, 255), cv2.FILLED, cv2.LINE_AA)
    cv2.circle(frame, pt, 3, color, cv2.FILLED, cv2.LINE_AA)


def _draw_annotation(frame: np.ndarray, ann: dict, kp_by_name: dict, w: int, h: int) -> None:
    color = _hex_to_bgr(ann.get("color", "#EF4444"))
    thickness = max(1, int(ann.get("thickness", 3)))
    shape = ann.get("shapeType", "line")

    a = _pt(kp_by_name.get(ann.get("startJoint")), w, h)

    label = ann.get("label")
    if label and a:
        cv2.putText(frame, label, (a[0] + 12, a[1] - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (15, 23, 42), thickness + 2, cv2.LINE_AA)
        cv2.putText(frame, label, (a[0] + 12, a[1] - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, thickness, cv2.LINE_AA)

    if a:
        _draw_joint_marker(frame, a, color, thickness)

    if shape == "point":
        return

    b = _pt(kp_by_name.get(ann.get("endJoint")), w, h)
    if b:
        _draw_joint_marker(frame, b, color, thickness)

    if shape == "circle":
        if a and b:
            r = int(math.hypot(b[0] - a[0], b[1] - a[1]))
            cv2.circle(frame, a, r, color, thickness, cv2.LINE_AA)
        return

    if shape == "angle":
        mid = _pt(kp_by_name.get(ann.get("midJoint")), w, h)
        if mid:
            _draw_joint_marker(frame, mid, color, thickness)
        if a and mid and b:
            cv2.line(frame, mid, a, color, thickness, cv2.LINE_AA)
            cv2.line(frame, mid, b, color, thickness, cv2.LINE_AA)
            a1 = math.atan2(a[1] - mid[1], a[0] - mid[0])
            a2 = math.atan2(b[1] - mid[1], b[0] - mid[0])
            diff = a2 - a1
            diff = math.atan2(math.sin(diff), math.cos(diff))
            deg = round(abs(diff) * 180 / math.pi)
            cv2.ellipse(frame, mid, (22, 22), 0,
                        int(math.degrees(a1)), int(math.degrees(a1 + diff)),
                        color, 1, cv2.LINE_AA)
            bisector = a1 + diff / 2
            tx = int(mid[0] + 36 * math.cos(bisector))
            ty = int(mid[1] + 36 * math.sin(bisector))
            cv2.putText(frame, f"{deg}°", (tx - 10, ty + 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (15, 23, 42), thickness + 2, cv2.LINE_AA)
            cv2.putText(frame, f"{deg}°", (tx - 10, ty + 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, thickness, cv2.LINE_AA)
        return

    if not a or not b:
        return
    cv2.line(frame, a, b, color, thickness, cv2.LINE_AA)
    if shape == "arrow":
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        head = 14 + thickness * 2
        for off in (-math.pi / 6, math.pi / 6):
            hx = int(b[0] - head * math.cos(ang + off))
            hy = int(b[1] - head * math.sin(ang + off))
            cv2.line(frame, b, (hx, hy), color, thickness, cv2.LINE_AA)


def _open_ffmpeg_encoder(width: int, height: int, fps: float, audio_source_path: str, output_path: str) -> tuple[subprocess.Popen, str]:
    """Starts ffmpeg reading raw BGR24 frames from stdin, muxing audio from
    `audio_source_path` (the '?' in '1:a:0?' makes that stream mapping
    optional, so a source with no audio track still produces a valid
    video-only file in the same code path instead of needing a separate
    fallback invocation), and encoding directly to H.264 in one pass.

    stderr is redirected to a temp file, not a pipe: writing a large volume
    of raw frames to stdin while nothing drains a stderr pipe can deadlock
    once both OS pipe buffers fill. Caller must write each frame to
    proc.stdin, then call _finish_ffmpeg_encoder() when done.
    """
    stderr_fd, stderr_path = tempfile.mkstemp(suffix=".ffmpeg.log")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", str(fps),
        "-i", "pipe:0",
        "-i", audio_source_path,
        "-map", "0:v:0", "-map", "1:a:0?",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        "-movflags", "+faststart",
        output_path,
    ]
    with os.fdopen(stderr_fd, "wb") as stderr_handle:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=stderr_handle)
    return proc, stderr_path


def _finish_ffmpeg_encoder(proc: subprocess.Popen, stderr_path: str, timeout_s: float) -> None:
    assert proc.stdin is not None
    proc.stdin.close()
    try:
        proc.wait(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        raise RuntimeError(f"ffmpeg encode timed out after {timeout_s:.0f}s")
    if proc.returncode != 0:
        err = ""
        try:
            with open(stderr_path, "rb") as f:
                err = f.read()[-500:].decode("utf-8", errors="replace")
        except OSError:
            pass
        raise RuntimeError(f"ffmpeg encode failed (exit {proc.returncode}): {err}")


def _report_progress(progress_url: str | None, callback_token: str, percent: int) -> None:
    if not progress_url:
        return
    try:
        requests.post(
            progress_url,
            json={"percent": percent},
            headers={"X-Callback-Token": callback_token},
            timeout=PROGRESS_TIMEOUT_S,
        )
    except Exception:
        # Never let a progress-report hiccup abort the export itself.
        logger.debug("Export: progress report failed (percent=%d)", percent, exc_info=True)


def export_annotated_video(
    ref_id: str,
    video_url: str,
    keypoints_url: str,
    upload_url: str,
    callback_token: str,
    annotations: list[dict],
    keypoint_format: str = "halpe26",
    include_skeleton: bool = False,
    include_annotations: bool = True,
    callback_url: str | None = None,
    progress_url: str | None = None,
) -> None:
    """Render raw video + skeleton and/or annotations → MP4 with audio, upload it.

    include_skeleton and include_annotations are independent — either, both,
    or (rejected upstream in ReferenceService.startExport) neither. Previously
    "skeleton off" silently drew small per-joint highlight dots instead of
    nothing, and annotations were always drawn regardless of either flag —
    there was no way to actually export "skeleton only, zero annotations."

    Failure was previously silent — logged here, but nothing ever told the
    API an export had failed, so a broken job left the coach's UI stuck on
    "Exporting…" forever. If callback_url is provided (see
    ReferenceExportRequest.callbackUrl), a failure now posts
    {"status": "failed", "reason": ...} to it, mirroring
    reference_processor.py's existing callback contract.
    """
    import json

    local_path: str | None = None
    out_path: str | None = None
    kp_path: str | None = None
    ffmpeg_stderr_path: str | None = None
    try:
        logger.info("Export %s: downloading video + keypoints", ref_id)
        local_path = _download(video_url, Path(video_url.split("?")[0]).suffix or ".mp4")
        kp_path = _download(keypoints_url, ".json")
        with open(kp_path) as f:
            kp_data = json.load(f)

        frames_by_index: dict[int, dict] = {}
        for fr in kp_data.get("frames", []):
            frames_by_index[fr["frameIndex"]] = {kp["name"]: kp for kp in fr["keypoints"]}

        cap = cv2.VideoCapture(local_path)
        if not cap.isOpened():
            raise RuntimeError("Could not open video for export")
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0

        out_fd, out_path = tempfile.mkstemp(suffix=".mp4")
        os.close(out_fd)
        ffmpeg_proc, ffmpeg_stderr_path = _open_ffmpeg_encoder(width, height, fps, local_path, out_path)
        assert ffmpeg_proc.stdin is not None

        idx = 0
        start_time = time.monotonic()
        last_reported_pct = -1
        last_report_time = start_time
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if time.monotonic() - start_time > MAX_PROCESSING_SECONDS:
                    logger.warning(
                        "Export %s: hit MAX_PROCESSING_SECONDS cap (%ds) at frame %d, truncating",
                        ref_id, MAX_PROCESSING_SECONDS, idx,
                    )
                    break
                kp_by_name = frames_by_index.get(idx, {})

                if include_skeleton and kp_by_name:
                    draw_skeleton(frame, kp_by_name, width, height, keypoint_format)

                if include_annotations:
                    for ann in annotations:
                        ff = ann.get("fromFrame", 0)
                        uf = ann.get("untilFrame")
                        if idx < ff or (uf is not None and idx > uf):
                            continue
                        _draw_annotation(frame, ann, kp_by_name, width, height)

                ffmpeg_proc.stdin.write(frame.tobytes())
                idx += 1

                if total_frames > 0:
                    pct = min(99, int((idx / total_frames) * 100))
                    now = time.monotonic()
                    if (
                        pct >= last_reported_pct + PROGRESS_PERCENT_STEP
                        and (now - last_report_time) >= settings.export_progress_report_interval_s
                    ):
                        _report_progress(progress_url, callback_token, pct)
                        last_reported_pct = pct
                        last_report_time = now
        finally:
            cap.release()

        rendered_duration_s = idx / fps if fps else 0.0
        logger.info(
            "Export %s: rendered %d frames (%.0fs), finalizing encode",
            ref_id, idx, rendered_duration_s,
        )
        _finish_ffmpeg_encoder(ffmpeg_proc, ffmpeg_stderr_path, FFMPEG_FINALIZE_TIMEOUT_S)

        logger.info("Export %s: upload", ref_id)
        with open(out_path, "rb") as f:
            resp = requests.post(
                upload_url,
                files={"file": ("export.mp4", f, "video/mp4")},
                headers={"X-Callback-Token": callback_token},
                timeout=UPLOAD_TIMEOUT_S,
            )
        resp.raise_for_status()
        logger.info("Export %s: upload complete", ref_id)
    except Exception as exc:
        logger.exception("Export %s: failed", ref_id)
        if callback_url:
            try:
                fail_resp = requests.post(
                    callback_url,
                    json={"status": "failed", "reason": str(exc)},
                    headers={"X-Callback-Token": callback_token},
                    timeout=DOWNLOAD_TIMEOUT_S,
                )
                fail_resp.raise_for_status()
            except Exception:
                # Nothing further to fall back to — logged, and the job
                # will look identical to "still processing" to the API.
                # Same acknowledged limitation as reference_processor.py's
                # own callback-delivery-failure path.
                logger.exception("Export %s: failed to post failure callback", ref_id)
    finally:
        for p in (local_path, out_path, kp_path, ffmpeg_stderr_path):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
