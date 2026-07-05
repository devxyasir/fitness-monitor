#!/usr/bin/env python3
"""
Apply the 17 COCO keypoints to a video using MediaPipe (BlazePose).

MediaPipe outputs 33 landmarks; this script remaps them down to the exact
17 COCO points (in your order) and draws them on the video.

Usage:
    python pose_mediapipe.py --video in.mp4 --out out.mp4
    python pose_mediapipe.py --video in.mp4 --out out.mp4 --json kpts.json --complexity 2

Install:
    pip install mediapipe opencv-python numpy
(MediaPipe downloads its model on first run, so you need internet once.)
"""

import argparse
import json

import cv2
import numpy as np
import mediapipe as mp

# COCO-17 in the requested order
KEYPOINT_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]

# Map each COCO point -> its BlazePose (33-landmark) index
BLAZE_TO_COCO = {
    "nose": 0, "left_eye": 2, "right_eye": 5, "left_ear": 7, "right_ear": 8,
    "left_shoulder": 11, "right_shoulder": 12, "left_elbow": 13, "right_elbow": 14,
    "left_wrist": 15, "right_wrist": 16, "left_hip": 23, "right_hip": 24,
    "left_knee": 25, "right_knee": 26, "left_ankle": 27, "right_ankle": 28,
}
COCO_ORDER = [BLAZE_TO_COCO[n] for n in KEYPOINT_NAMES]

SKELETON = [
    (0, 1), (0, 2), (1, 3), (2, 4),
    (5, 6),
    (5, 7), (7, 9), (6, 8), (8, 10),
    (5, 11), (6, 12), (11, 12),
    (11, 13), (13, 15), (12, 14), (14, 16),
]


def draw(frame, kpts, vis, thr):
    for (i, j) in SKELETON:
        if vis[i] > thr and vis[j] > thr:
            cv2.line(frame, tuple(kpts[i]), tuple(kpts[j]), (0, 255, 0), 2, cv2.LINE_AA)
    for k in range(len(kpts)):
        if vis[k] > thr:
            cv2.circle(frame, tuple(kpts[k]), 3, (0, 0, 255), -1, cv2.LINE_AA)
    return frame


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", default="pose_out_mp.mp4")
    ap.add_argument("--json", default=None)
    ap.add_argument("--complexity", type=int, default=1, choices=[0, 1, 2],
                    help="0=lite, 1=full, 2=heavy (more accurate, slower)")
    ap.add_argument("--min-det-conf", type=float, default=0.5)
    ap.add_argument("--min-track-conf", type=float, default=0.5)
    ap.add_argument("--kpt-thr", type=float, default=0.3, help="visibility threshold")
    args = ap.parse_args()

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise SystemExit(f"Could not open video: {args.video}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    writer = cv2.VideoWriter(args.out, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

    pose = mp.solutions.pose.Pose(
        model_complexity=args.complexity,
        min_detection_confidence=args.min_det_conf,
        min_tracking_confidence=args.min_track_conf,
    )

    all_frames = []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = pose.process(rgb)

        people = []
        if result.pose_landmarks:
            lms = result.pose_landmarks.landmark
            kpts = np.zeros((17, 2), dtype=int)
            vis = np.zeros(17, dtype=float)
            for out_i, blaze_i in enumerate(COCO_ORDER):
                lm = lms[blaze_i]
                kpts[out_i] = [int(lm.x * w), int(lm.y * h)]
                vis[out_i] = lm.visibility
            draw(frame, kpts, vis, args.kpt_thr)
            people.append({
                "keypoints": [
                    {"name": KEYPOINT_NAMES[k],
                     "x": int(kpts[k][0]), "y": int(kpts[k][1]),
                     "score": float(vis[k])}
                    for k in range(17)
                ]
            })

        writer.write(frame)
        all_frames.append({"frame": idx, "people": people})
        idx += 1
        if idx % 50 == 0:
            print(f"processed {idx} frames")

    cap.release()
    writer.release()
    pose.close()
    print(f"Saved video -> {args.out}  ({idx} frames)")

    if args.json:
        with open(args.json, "w") as f:
            json.dump(all_frames, f)
        print(f"Saved keypoints -> {args.json}")


if __name__ == "__main__":
    main()