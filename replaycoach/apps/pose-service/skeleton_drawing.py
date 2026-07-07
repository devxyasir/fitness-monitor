"""
Skeleton drawing — shared by process_1mp4.py (manual local testing),
reference_processor.py (Full Body Analysis burn-in), and the annotation
export renderer, so all burn the exact same visualization onto real pixels.

Format-aware: draws COCO-17 or Halpe-26 (adds neck/pelvis spine + full feet).
"""

from __future__ import annotations

import cv2
import numpy as np

from inference import COCO_KEYPOINT_NAMES, HALPE26_KEYPOINT_NAMES

# Index-pair connections, mirroring packages/types/src/pose.ts.
COCO_SKELETON_CONNECTIONS = [
    (0, 1), (0, 2), (1, 3), (2, 4),
    (5, 6),
    (5, 7), (7, 9),
    (6, 8), (8, 10),
    (5, 11), (6, 12),
    (11, 12),
    (11, 13), (13, 15),
    (12, 14), (14, 16),
]

HALPE26_SKELETON_CONNECTIONS = [
    # face
    (0, 1), (0, 2), (1, 3), (2, 4), (0, 17),
    # spine: head-neck-pelvis, neck-shoulders, pelvis-hips
    (17, 18), (18, 19), (18, 5), (18, 6), (19, 11), (19, 12),
    # shoulders + hips
    (5, 6), (11, 12),
    # arms
    (5, 7), (7, 9), (6, 8), (8, 10),
    # legs
    (11, 13), (13, 15), (12, 14), (14, 16),
    # left foot: ankle-heel, ankle-big toe, big toe-small toe
    (15, 24), (15, 20), (20, 22),
    # right foot
    (16, 25), (16, 21), (21, 23),
]

MIN_SCORE = 0.3

AMBER = (0, 165, 255)  # BGR
DARK = (40, 40, 40)     # BGR — thin contrast outline so joints read on any background
LINE_THICKNESS = 2
# A genuine thin ring with clearly open space inside — radius is much larger
# than the 1px stroke, so the joint reads as a hollow circle, not a dot/bullet.
JOINT_RADIUS = 7
JOINT_THICKNESS = 1

# Back-compat alias (older imports referenced SKELETON_CONNECTIONS = COCO set).
SKELETON_CONNECTIONS = COCO_SKELETON_CONNECTIONS


def _config_for(keypoint_format: str) -> tuple[list[str], list[tuple[int, int]]]:
    if keypoint_format == "halpe26":
        return HALPE26_KEYPOINT_NAMES, HALPE26_SKELETON_CONNECTIONS
    return COCO_KEYPOINT_NAMES, COCO_SKELETON_CONNECTIONS


def draw_skeleton(
    frame: np.ndarray,
    keypoints_by_name: dict,
    width: int,
    height: int,
    keypoint_format: str = "halpe26",
) -> None:
    """Draws directly onto `frame` in place (BGR, as read by cv2.VideoCapture)."""
    names, connections = _config_for(keypoint_format)
    ordered = [keypoints_by_name.get(name) for name in names]

    for a, b in connections:
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
