"""
Auto-downloads pose/detector ONNX models on first run so the large binary
checkpoints never need to be committed to git — the server fetches them
itself the first time inference.py's load() methods run.

RTMPose sources: official OpenMMLab body7 ONNX SDK packages (COCO-17
keypoints), the same URLs documented/used by the maintained rtmlib wrapper
(https://github.com/Tau-J/rtmlib). OpenMMLab does not publish a separate
"large" tier for body7 — the real ladder is s -> m -> x, so "large"/"xlarge"
here maps to their largest available export (rtmpose-x, 384x288,
"performance" tier, 700-epoch training).

YOLO11-pose sources: the official `ultralytics` package's own download
(hash-verified, from Ultralytics' release CDN) — we only pick the size
tier; the package handles fetching the .pt checkpoint, then we export it
to ONNX locally.
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

# (download URL, (H, W) input resolution) per size tier.
RTMPOSE_SOURCES: dict[str, tuple[str, tuple[int, int]]] = {
    "small": (
        "https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/"
        "rtmpose-s_simcc-body7_pt-body7_420e-256x192-acd4a1ef_20230504.zip",
        (256, 192),
    ),
    "medium": (
        "https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/"
        "rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504.zip",
        (256, 192),
    ),
    "large": (
        "https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/"
        "rtmpose-x_simcc-body7_pt-body7_700e-384x288-71d7b7e9_20230629.zip",
        (384, 288),
    ),
    "xlarge": (
        "https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/"
        "rtmpose-x_simcc-body7_pt-body7_700e-384x288-71d7b7e9_20230629.zip",
        (384, 288),
    ),
}

# Ultralytics YOLO11-pose checkpoint tier letters.
YOLO_POSE_TIERS: dict[str, str] = {
    "small": "n",
    "medium": "s",
    "large": "l",
    "xlarge": "x",
}


def rtmpose_input_size(model_size: str) -> tuple[int, int]:
    """(H, W) input resolution for a given RTMPose size tier."""
    return RTMPOSE_SOURCES.get(model_size, RTMPOSE_SOURCES["medium"])[1]


def ensure_rtmpose_model(target_path: str, model_size: str) -> None:
    """Downloads + extracts the RTMPose ONNX SDK package for `model_size`
    into `target_path`, if not already present on disk."""
    dest = Path(target_path)
    if dest.exists():
        return

    url, _ = RTMPOSE_SOURCES.get(model_size, RTMPOSE_SOURCES["medium"])
    logger.info("RTMPose model missing at %s — downloading (%s size) from %s", target_path, model_size, url)
    dest.parent.mkdir(parents=True, exist_ok=True)
    _download_and_extract_onnx(url, dest)
    logger.info("RTMPose model ready at %s", target_path)


def ensure_yolo_pose_model(target_path: str, model_size: str) -> None:
    """
    Downloads the official Ultralytics YOLO11-pose checkpoint matching
    `model_size` via the `ultralytics` package (its own hash-verified CDN)
    and exports it to ONNX at `target_path`, if not already present.
    """
    dest = Path(target_path)
    if dest.exists():
        return

    tier = YOLO_POSE_TIERS.get(model_size, "n")
    dest.parent.mkdir(parents=True, exist_ok=True)
    logger.info("YOLO11%s-pose ONNX missing at %s — fetching + exporting via ultralytics", tier, target_path)

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError(
            "ultralytics package is required to auto-download YOLO-pose models "
            "(pip install ultralytics) — this is a one-time cost; the exported "
            "ONNX file is reused on every later startup."
        ) from exc

    # Run the download + export inside a scratch cwd so the intermediate
    # .pt checkpoint (and any export byproducts) get cleaned up afterward
    # instead of littering the pose-service working directory.
    prev_cwd = os.getcwd()
    with tempfile.TemporaryDirectory() as tmp:
        try:
            os.chdir(tmp)
            model = YOLO(f"yolo11{tier}-pose.pt")  # auto-downloads the .pt checkpoint
            exported = model.export(format="onnx")  # writes yolo11{tier}-pose.onnx
            shutil.move(str(exported), str(dest))
        finally:
            os.chdir(prev_cwd)

    logger.info("YOLO11%s-pose ONNX ready at %s", tier, target_path)


def _download_and_extract_onnx(url: str, dest: Path) -> None:
    """Downloads a zip package and moves the single .onnx file inside to `dest`."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        zip_path = tmp_path / "model.zip"

        with requests.get(url, stream=True, timeout=300) as resp:
            resp.raise_for_status()
            with open(zip_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=1024 * 1024):
                    f.write(chunk)

        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(tmp_path)

        onnx_files = list(tmp_path.rglob("*.onnx"))
        if not onnx_files:
            raise RuntimeError(f"No .onnx file found inside downloaded package: {url}")
        shutil.move(str(onnx_files[0]), str(dest))
