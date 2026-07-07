"""
Skeleton drawing — shared by process_1mp4.py (manual local testing) and
reference_processor.py (production reference-video analysis), so both burn
in the exact same visualization onto real video pixels.
"""

from __future__ import annotations

import cv2
import numpy as np

from inference import COCO_KEYPOINT_NAMES

# Mirrors packages/types/src/pose.ts COCO_SKELETON_CONNECTIONS exactly.
SKELETON_CONNECTIONS = [
    (0, 1), (0, 2),
    (1, 3), (2, 4),
    (5, 6),
    (5, 7), (7, 9),
    (6, 8), (8, 10),
    (5, 11), (6, 12),
    (11, 12),
    (11, 13), (13, 15),
    (12, 14), (14, 16),
]

MIN_SCORE = 0.3


def draw_skeleton(frame: np.ndarray, keypoints_by_name: dict, width: int, height: int) -> None:
    """Draws directly onto `frame` in place (BGR, as read by cv2.VideoCapture)."""
    ordered = [keypoints_by_name.get(name) for name in COCO_KEYPOINT_NAMES]

    for a, b in SKELETON_CONNECTIONS:
        kp_a, kp_b = ordered[a], ordered[b]
        if not kp_a or not kp_b or kp_a["score"] < MIN_SCORE or kp_b["score"] < MIN_SCORE:
            continue
        pa = (int(kp_a["x"] * width), int(kp_a["y"] * height))
        pb = (int(kp_b["x"] * width), int(kp_b["y"] * height))
        cv2.line(frame, pa, pb, (0, 165, 255), 3, cv2.LINE_AA)  # amber (BGR)

    for kp in ordered:
        if not kp or kp["score"] < MIN_SCORE:
            continue
        p = (int(kp["x"] * width), int(kp["y"] * height))
        cv2.circle(frame, p, 5, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(frame, p, 3, (0, 165, 255), -1, cv2.LINE_AA)
