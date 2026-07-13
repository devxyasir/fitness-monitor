"""
Annotation-tracking export renderer.

Takes a raw video + its keypoints JSON + a list of joint-attached
annotations, and renders a browser-playable MP4 with the coach's
annotations burned in — resolving each annotation's joints from the
keypoints per frame (no re-inference, no pixel tracking).

Audio from the original video is preserved via FFmpeg two-pass mux.
"""

from __future__ import annotations

import logging
import math
import os
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np
import requests

from config import settings
from skeleton_drawing import draw_skeleton

logger = logging.getLogger(__name__)

DOWNLOAD_TIMEOUT_S = 60
UPLOAD_TIMEOUT_S = 120
FFMPEG_EXIT_TIMEOUT_S = 120
# Same threshold as skeleton_drawing.py's own MIN_SCORE (config-driven,
# POSE_SKELETON_MIN_SCORE) — previously a second, independently-hardcoded
# 0.3 here that could silently drift out of sync with the skeleton layer's.
MIN_SCORE = settings.skeleton_min_score


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


def _start_video_writer(output_path: str, width: int, height: int, fps: float) -> cv2.VideoWriter:
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    return cv2.VideoWriter(output_path, fourcc, fps, (width, height))


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


def _mux_audio_video(video_path: str, audio_source_path: str, output_path: str) -> None:
    """Mux the silent annotated video with audio from the source using FFmpeg.

    Re-encodes to H.264 (not '-c:v copy'): the silent video comes out of
    cv2.VideoWriter as mp4v (MPEG-4 Part 2), which no major browser can
    play. This pass both adds audio and produces a browser-playable stream.
    """
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", video_path,
        "-i", audio_source_path,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
        "-c:a", "aac", "-b:a", "128k",
        "-map", "0:v:0", "-map", "1:a:0",
        "-shortest",
        "-movflags", "+faststart",
        output_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, timeout=FFMPEG_EXIT_TIMEOUT_S)
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")[-500:]
        raise RuntimeError(f"ffmpeg audio mux failed (exit {proc.returncode}): {err}")


def _reencode_video_only(video_path: str, output_path: str) -> None:
    """Re-encode to browser-playable H.264, no audio (source has no audio track)."""
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", video_path,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
        "-an",
        "-movflags", "+faststart",
        output_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, timeout=FFMPEG_EXIT_TIMEOUT_S)
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")[-500:]
        raise RuntimeError(f"ffmpeg re-encode failed (exit {proc.returncode}): {err}")


def export_annotated_video(
    ref_id: str,
    video_url: str,
    keypoints_url: str,
    upload_url: str,
    callback_token: str,
    annotations: list[dict],
    keypoint_format: str = "halpe26",
    draw_skeleton_layer: bool = False,
    callback_url: str | None = None,
) -> None:
    """Render raw video + annotations (optional skeleton) → MP4 with audio, upload it.

    Failure was previously silent — logged here, but nothing ever told the
    API an export had failed, so a broken job left the coach's UI stuck on
    "Exporting…" forever. If callback_url is provided (see
    ReferenceExportRequest.callbackUrl), a failure now posts
    {"status": "failed", "reason": ...} to it, mirroring
    reference_processor.py's existing callback contract.
    """
    import json

    local_path: str | None = None
    silent_path: str | None = None
    out_path: str | None = None
    kp_path: str | None = None
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

        out_fd, silent_path = tempfile.mkstemp(suffix=".mp4")
        os.close(out_fd)
        writer = _start_video_writer(silent_path, width, height, fps)

        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            kp_by_name = frames_by_index.get(idx, {})

            if draw_skeleton_layer and kp_by_name:
                draw_skeleton(frame, kp_by_name, width, height, keypoint_format)
            elif kp_by_name:
                active_joints: set[str] = set()
                for ann in annotations:
                    ff = ann.get("fromFrame", 0)
                    uf = ann.get("untilFrame")
                    if idx < ff or (uf is not None and idx > uf):
                        continue
                    for jkey in ("startJoint", "endJoint", "midJoint"):
                        val = ann.get(jkey)
                        if val:
                            active_joints.add(val)
                for joint_name in active_joints:
                    jpt = _pt(kp_by_name.get(joint_name), width, height)
                    if jpt:
                        cv2.circle(frame, jpt, 6, (42, 23, 15), 1, cv2.LINE_AA)
                        cv2.circle(frame, jpt, 5, (255, 255, 255), cv2.FILLED, cv2.LINE_AA)

            for ann in annotations:
                ff = ann.get("fromFrame", 0)
                uf = ann.get("untilFrame")
                if idx < ff or (uf is not None and idx > uf):
                    continue
                _draw_annotation(frame, ann, kp_by_name, width, height)

            writer.write(frame)
            idx += 1

        cap.release()
        writer.release()
        logger.info("Export %s: rendered %d frames, muxing audio", ref_id, idx)

        out_fd, out_path = tempfile.mkstemp(suffix=".mp4")
        os.close(out_fd)
        try:
            _mux_audio_video(silent_path, local_path, out_path)
        except RuntimeError as mux_err:
            # Common cause: the source reference video has no audio track
            # (`-map 1:a:0` has nothing to map). Fall back to a video-only
            # re-encode so export still succeeds and is browser-playable.
            logger.warning("Export %s: audio mux failed (%s), falling back to video-only", ref_id, mux_err)
            _reencode_video_only(silent_path, out_path)

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
        for p in (local_path, silent_path, out_path, kp_path):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
