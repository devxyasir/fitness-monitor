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


AMBER = (0, 165, 255)  # BGR
DARK = (40, 40, 40)     # BGR — thin contrast outline so joints read on any background
LINE_THICKNESS = 2
# A genuine thin ring with clearly open space inside — radius is much larger
# than the 1px stroke, so the joint reads as a hollow circle, not a dot/bullet.
JOINT_RADIUS = 7        # consistent across every joint
JOINT_THICKNESS = 1     # 1px stroke = thin outline, hollow center


def draw_skeleton(frame: np.ndarray, keypoints_by_name: dict, width: int, height: int) -> None:
    """Draws directly onto `frame` in place (BGR, as read by cv2.VideoCapture)."""
    ordered = [keypoints_by_name.get(name) for name in COCO_KEYPOINT_NAMES]

    for a, b in SKELETON_CONNECTIONS:
        kp_a, kp_b = ordered[a], ordered[b]
        if not kp_a or not kp_b or kp_a["score"] < MIN_SCORE or kp_b["score"] < MIN_SCORE:
            continue
        pa = (int(kp_a["x"] * width), int(kp_a["y"] * height))
        pb = (int(kp_b["x"] * width), int(kp_b["y"] * height))
        cv2.line(frame, pa, pb, AMBER, LINE_THICKNESS, cv2.LINE_AA)

    # Thin hollow ring of a consistent size — a real open circle, not a filled
    # dot. A 1px dark ring just outside the amber gives contrast on any
    # background while keeping the interior clearly empty.
    for kp in ordered:
        if not kp or kp["score"] < MIN_SCORE:
            continue
        p = (int(kp["x"] * width), int(kp["y"] * height))
        cv2.circle(frame, p, JOINT_RADIUS + 1, DARK, JOINT_THICKNESS, cv2.LINE_AA)
        cv2.circle(frame, p, JOINT_RADIUS, AMBER, JOINT_THICKNESS, cv2.LINE_AA)
