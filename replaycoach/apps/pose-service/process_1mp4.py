"""
One-off manual test: run the real RTMPose pipeline against the repo's sample
video (1.mp4) and save the results next to it — a skeleton-overlaid MP4 and
the raw per-frame keypoints JSON — so pose detection can be eyeballed
directly without needing the API/web/socket stack running.

Usage: python process_1mp4.py
"""
from __future__ import annotations

import json
import logging
import time

import cv2
import numpy as np

from inference import create_model_adapter, COCO_KEYPOINT_NAMES

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("process_1mp4")

SOURCE = r"C:\Users\jamya\Desktop\Fitness Platform\1.mp4"
OUT_VIDEO = r"C:\Users\jamya\Desktop\Fitness Platform\1_pose_overlay.mp4"
OUT_JSON = r"C:\Users\jamya\Desktop\Fitness Platform\1_keypoints.json"

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


def main() -> None:
    logger.info("Loading RTMPose model...")
    model = create_model_adapter()
    model.load()

    cap = cv2.VideoCapture(SOURCE)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open {SOURCE}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_count_hint = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    logger.info("Source: %dx%d @ %.2ffps, ~%d frames", width, height, fps, frame_count_hint)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(OUT_VIDEO, fourcc, fps, (width, height))

    frames_json = []
    frame_index = 0
    frames_with_detection = 0
    t0 = time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        result = model.infer(frame)
        kp_by_name = {kp.name: {"x": kp.x, "y": kp.y, "score": kp.score} for kp in result.keypoints}
        if kp_by_name:
            frames_with_detection += 1

        draw_skeleton(frame, kp_by_name, width, height)
        # Frame counter burned into the video for easy visual cross-check.
        cv2.putText(frame, f"f{frame_index}", (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
        writer.write(frame)

        frames_json.append({
            "frameIndex": frame_index,
            "timestampMs": round((frame_index / fps) * 1000),
            "keypoints": [
                {"name": kp.name, "x": kp.x, "y": kp.y, "score": kp.score}
                for kp in result.keypoints
            ],
        })

        if frame_index % 30 == 0:
            logger.info("Processed frame %d/%d (avg conf: %.2f)", frame_index, frame_count_hint, result.confidence_avg)

        frame_index += 1

    cap.release()
    writer.release()

    elapsed = time.time() - t0
    logger.info(
        "Done: %d frames processed in %.1fs (%.1f fps). %d/%d frames had a detection.",
        frame_index, elapsed, frame_index / elapsed if elapsed else 0, frames_with_detection, frame_index,
    )

    output = {
        "fps": fps,
        "frameCount": frame_index,
        "width": width,
        "height": height,
        "durationMs": round((frame_index / fps) * 1000),
        "frames": frames_json,
    }
    with open(OUT_JSON, "w") as f:
        json.dump(output, f)

    logger.info("Wrote annotated video to %s", OUT_VIDEO)
    logger.info("Wrote keypoints JSON to %s", OUT_JSON)


if __name__ == "__main__":
    main()
