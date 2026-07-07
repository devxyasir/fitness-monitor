"""
Annotation-tracking export renderer.

Takes a raw video + its keypoints JSON + a list of joint-attached
annotations, and renders a browser-playable MP4 with the skeleton and the
tracked annotations burned in — resolving each annotation's joints from the
keypoints per frame (no re-inference, no pixel tracking). This is the export
path for the new Annotation Tracking feature; editing stays on canvas layers.
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

from skeleton_drawing import draw_skeleton

logger = logging.getLogger(__name__)

DOWNLOAD_TIMEOUT_S = 60
UPLOAD_TIMEOUT_S = 120
FFMPEG_EXIT_TIMEOUT_S = 60
MIN_SCORE = 0.3


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


def _start_ffmpeg(output_path: str, width: int, height: int, fps: float) -> subprocess.Popen:
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", str(fps or 30.0),
        "-i", "-",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        output_path,
    ]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _pt(kp: dict | None, w: int, h: int) -> tuple[int, int] | None:
    if not kp or kp.get("score", 0) < MIN_SCORE:
        return None
    return (int(kp["x"] * w), int(kp["y"] * h))


def _draw_annotation(frame: np.ndarray, ann: dict, kp_by_name: dict, w: int, h: int) -> None:
    color = _hex_to_bgr(ann.get("color", "#EF4444"))
    thickness = max(1, int(ann.get("thickness", 3)))
    shape = ann.get("shapeType", "line")

    a = _pt(kp_by_name.get(ann.get("startJoint")), w, h)
    
    # Draw Label text note if present
    label = ann.get("label")
    if label and a:
        cv2.putText(
            frame,
            label,
            (a[0] + 12, a[1] - 12),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (15, 23, 42), # dark backdrop outline
            thickness + 2,
            cv2.LINE_AA
        )
        cv2.putText(
            frame,
            label,
            (a[0] + 12, a[1] - 12),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            color,
            thickness,
            cv2.LINE_AA
        )

    if shape == "point":
        if a:
            cv2.circle(frame, a, thickness * 3, color, thickness, cv2.LINE_AA)
        return

    b = _pt(kp_by_name.get(ann.get("endJoint")), w, h)

    if shape == "circle":
        if a and b:
            r = int(math.hypot(b[0] - a[0], b[1] - a[1]))
            cv2.circle(frame, a, r, color, thickness, cv2.LINE_AA)
        return

    if shape == "angle":
        mid = _pt(kp_by_name.get(ann.get("midJoint")), w, h)
        if a and mid and b:
            cv2.line(frame, mid, a, color, thickness, cv2.LINE_AA)
            cv2.line(frame, mid, b, color, thickness, cv2.LINE_AA)
            
            # Math for degrees arc & label
            v1 = (a[0] - mid[0], a[1] - mid[1])
            v2 = (b[0] - mid[0], b[1] - mid[1])
            a1 = math.atan2(v1[1], v1[0])
            a2 = math.atan2(v2[1], v2[0])
            diff = a2 - a1
            diff = math.atan2(math.sin(diff), math.cos(diff))
            deg = round(abs(diff) * 180 / math.pi)

            # Draw visual arc at vertex
            start_deg = int(math.degrees(a1))
            cv2.ellipse(
                frame,
                mid,
                (22, 22),
                0,
                start_deg,
                start_deg + int(math.degrees(diff)),
                color,
                1,
                cv2.LINE_AA
            )

            # Degree label placement along the bisector
            bisector = a1 + diff / 2
            tx = int(mid[0] + 36 * math.cos(bisector))
            ty = int(mid[1] + 36 * math.sin(bisector))
            
            cv2.putText(frame, f"{deg}o", (tx - 10, ty + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (15, 23, 42), thickness + 2, cv2.LINE_AA)
            cv2.putText(frame, f"{deg}o", (tx - 10, ty + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, thickness, cv2.LINE_AA)
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


def export_annotated_video(
    ref_id: str,
    video_url: str,
    keypoints_url: str,
    upload_url: str,
    callback_token: str,
    annotations: list[dict],
    keypoint_format: str = "halpe26",
    draw_skeleton_layer: bool = True,
) -> None:
    """Render raw video + skeleton + tracked annotations → MP4, upload it."""
    import json

    local_path: str | None = None
    out_path: str | None = None
    try:
        logger.info("Export %s: downloading video + keypoints", ref_id)
        local_path = _download(video_url, Path(video_url.split("?")[0]).suffix or ".mp4")
        kp_path = _download(keypoints_url, ".json")
        with open(kp_path) as f:
            kp_data = json.load(f)
        os.remove(kp_path)

        frames_by_index: dict[int, dict] = {}
        for fr in kp_data.get("frames", []):
            frames_by_index[fr["frameIndex"]] = {kp["name"]: kp for kp in fr["keypoints"]}

        cap = cv2.VideoCapture(local_path)
        if not cap.isOpened():
            raise RuntimeError("Could not open video for export")
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        out_fd, out_path = tempfile.mkstemp(suffix=".mp4")
        os.close(out_fd)
        ffmpeg = _start_ffmpeg(out_path, width, height, fps)

        idx = 0
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                kp_by_name = frames_by_index.get(idx, {})
                if draw_skeleton_layer and kp_by_name:
                    draw_skeleton(frame, kp_by_name, width, height, keypoint_format)
                for ann in annotations:
                    ff = ann.get("fromFrame", 0)
                    uf = ann.get("untilFrame")
                    if idx < ff or (uf is not None and idx > uf):
                        continue
                    _draw_annotation(frame, ann, kp_by_name, width, height)
                ffmpeg.stdin.write(frame.tobytes())
                idx += 1
        finally:
            cap.release()
            if ffmpeg.stdin:
                ffmpeg.stdin.close()
            try:
                ffmpeg.wait(timeout=FFMPEG_EXIT_TIMEOUT_S)
            except subprocess.TimeoutExpired:
                ffmpeg.kill()

        logger.info("Export %s: rendered %d frames, uploading", ref_id, idx)
        with open(out_path, "rb") as f:
            resp = requests.post(
                upload_url,
                files={"file": ("export.mp4", f, "video/mp4")},
                headers={"X-Callback-Token": callback_token},
                timeout=UPLOAD_TIMEOUT_S,
            )
        resp.raise_for_status()
        logger.info("Export %s: upload complete", ref_id)
    except Exception:
        logger.exception("Export %s: failed", ref_id)
    finally:
        for p in (local_path, out_path):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
