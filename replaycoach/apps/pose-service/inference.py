"""
Pose inference module — PoseModelAdapter abstraction + RTMPose ONNX implementation.

Output contract: strictly {keypoints, confidence}.
No scoring, quality, correctness, or feedback fields.
"""

from __future__ import annotations

import abc
import logging
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from config import settings

logger = logging.getLogger(__name__)

# COCO-17 keypoint names in canonical order
COCO_KEYPOINT_NAMES = [
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]


@dataclass
class KeypointResult:
    """A single detected keypoint."""

    name: str
    x: float  # normalized [0, 1]
    y: float  # normalized [0, 1]
    score: float


@dataclass
class PoseResult:
    """Output of a single-frame pose inference. Strictly {keypoints, confidence}."""

    keypoints: list[KeypointResult] = field(default_factory=list)
    confidence_avg: float = 0.0


class PoseModelAdapter(abc.ABC):
    """Abstract interface for swappable pose models (RTMPose, YOLO-Pose, etc.)."""

    @abc.abstractmethod
    def load(self) -> None:
        """Load model weights into memory."""

    @abc.abstractmethod
    def infer(self, frame: np.ndarray) -> PoseResult:
        """Run inference on a single BGR frame, return normalized keypoints."""


class RTMPoseAdapter(PoseModelAdapter):
    """
    RTMPose inference via ONNX Runtime.

    Loads the model once and runs inference per-frame. Outputs COCO-17
    keypoints with coordinates normalized to [0, 1].
    """

    def __init__(self, model_path: str | None = None):
        self._model_path = model_path or settings.onnx_model_path
        self._session = None
        self._input_size = (256, 192)  # RTMPose default input resolution (H, W)

    def load(self) -> None:
        """Load ONNX Runtime inference session."""
        import onnxruntime as ort

        model_file = Path(self._model_path)
        if not model_file.exists():
            logger.warning(
                "ONNX model not found at %s — inference will use stub mode",
                self._model_path,
            )
            return

        providers = ort.get_available_providers()
        preferred = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        active = [p for p in preferred if p in providers]

        self._session = ort.InferenceSession(str(model_file), providers=active)
        logger.info(
            "RTMPose ONNX model loaded from %s (providers: %s)",
            self._model_path,
            active,
        )

    def _preprocess(self, frame: np.ndarray) -> np.ndarray:
        """Resize, normalize, and transpose frame for ONNX input."""
        h, w = self._input_size
        resized = cv2.resize(frame, (w, h), interpolation=cv2.INTER_LINEAR)

        # Normalize to [0, 1] and convert BGR → RGB
        blob = cv2.dnn.blobFromImage(
            resized,
            scalefactor=1.0 / 255.0,
            size=(w, h),
            swapRB=True,
            crop=False,
        )
        return blob

    def _postprocess(
        self, output: np.ndarray, orig_h: int, orig_w: int
    ) -> PoseResult:
        """Convert raw model output to normalized COCO-17 keypoints."""
        # Output shape varies by model version; commonly (1, 17, 3) for [x, y, score]
        if output.ndim == 3:
            kps = output[0]  # (17, 3)
        elif output.ndim == 2:
            kps = output  # (17, 3)
        else:
            logger.warning("Unexpected output shape: %s", output.shape)
            return PoseResult()

        keypoints: list[KeypointResult] = []
        scores: list[float] = []

        for i, name in enumerate(COCO_KEYPOINT_NAMES):
            if i >= len(kps):
                break

            raw_x, raw_y, score = float(kps[i][0]), float(kps[i][1]), float(kps[i][2])

            # Normalize coordinates to [0, 1]
            norm_x = max(0.0, min(1.0, raw_x / self._input_size[1]))
            norm_y = max(0.0, min(1.0, raw_y / self._input_size[0]))

            if score >= settings.min_confidence:
                keypoints.append(KeypointResult(name=name, x=norm_x, y=norm_y, score=score))
                scores.append(score)

        confidence_avg = float(np.mean(scores)) if scores else 0.0
        return PoseResult(keypoints=keypoints, confidence_avg=confidence_avg)

    def infer(self, frame: np.ndarray) -> PoseResult:
        """Run single-frame inference."""
        if self._session is None:
            # Stub mode — return empty result when model is not loaded
            return PoseResult()

        orig_h, orig_w = frame.shape[:2]
        input_blob = self._preprocess(frame)

        input_name = self._session.get_inputs()[0].name
        outputs = self._session.run(None, {input_name: input_blob})

        return self._postprocess(outputs[0], orig_h, orig_w)


class YOLOPoseAdapter(PoseModelAdapter):
    """
    YOLOv11-Pose / YOLOv8-Pose inference via ONNX Runtime.

    Processes single BGR frame, resizing to 640x640, and postprocesses
    to extract the person candidate with the highest bbox confidence.
    """

    def __init__(self, model_path: str | None = None):
        self._model_path = model_path or settings.onnx_model_path
        self._session = None
        self._input_size = (640, 640)  # Standard YOLO-Pose resolution

    def load(self) -> None:
        """Load ONNX Runtime inference session."""
        import onnxruntime as ort

        model_file = Path(self._model_path)
        if not model_file.exists():
            logger.warning(
                "YOLO Pose ONNX model not found at %s — inference will use stub mode",
                self._model_path,
            )
            return

        providers = ort.get_available_providers()
        preferred = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        active = [p for p in preferred if p in providers]

        self._session = ort.InferenceSession(str(model_file), providers=active)
        logger.info(
            "YOLO Pose ONNX model loaded from %s (providers: %s)",
            self._model_path,
            active,
        )

    def _preprocess(self, frame: np.ndarray) -> np.ndarray:
        """Resize and normalize BGR frame to YOLO RGB input blob."""
        h, w = self._input_size
        resized = cv2.resize(frame, (w, h), interpolation=cv2.INTER_LINEAR)
        # Convert BGR to RGB and scale to [0, 1]
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        blob = rgb.astype(np.float32) / 255.0
        blob = np.transpose(blob, (2, 0, 1))  # (3, H, W)
        blob = np.expand_dims(blob, axis=0)   # (1, 3, H, W)
        return blob

    def _postprocess(self, output: np.ndarray) -> PoseResult:
        """Parse YOLO pose output to extract keypoints for the best person detection."""
        # Typically output is (1, 56, 8400) or similar
        # 56 items: x, y, w, h bbox coordinates, box confidence, and 17 * 3 keypoint triplets
        if output.ndim != 3:
            logger.warning("Unexpected YOLO output shape: %s", output.shape)
            return PoseResult()

        preds = output[0]  # (56, 8400)
        # Bbox confidence is at row index 4
        scores = preds[4, :]
        best_id = int(np.argmax(scores))
        best_score = float(scores[best_id])

        if best_score < settings.min_confidence:
            return PoseResult()

        best_pred = preds[:, best_id]

        keypoints: list[KeypointResult] = []
        kp_scores: list[float] = []

        for i, name in enumerate(COCO_KEYPOINT_NAMES):
            base_idx = 5 + i * 3
            if base_idx + 2 >= len(best_pred):
                break

            x_val = float(best_pred[base_idx])
            y_val = float(best_pred[base_idx + 1])
            score = float(best_pred[base_idx + 2])

            # Normalize coordinates relative to model input size (640)
            norm_x = max(0.0, min(1.0, x_val / self._input_size[0]))
            norm_y = max(0.0, min(1.0, y_val / self._input_size[1]))

            if score >= settings.min_confidence:
                keypoints.append(KeypointResult(name=name, x=norm_x, y=norm_y, score=score))
                kp_scores.append(score)

        confidence_avg = float(np.mean(kp_scores)) if kp_scores else 0.0
        return PoseResult(keypoints=keypoints, confidence_avg=confidence_avg)

    def infer(self, frame: np.ndarray) -> PoseResult:
        """Run single-frame YOLO inference."""
        if self._session is None:
            return PoseResult()

        input_blob = self._preprocess(frame)
        input_name = self._session.get_inputs()[0].name
        outputs = self._session.run(None, {input_name: input_blob})
        return self._postprocess(outputs[0])


def create_model_adapter() -> PoseModelAdapter:
    """Factory to create the designated pose model based on configuration."""
    model_type = settings.model_type.lower()
    model_size = settings.model_size.lower()

    # Determine default paths based on type and size, if not overridden in env
    model_path = settings.onnx_model_path
    if model_path == "./models/rtmpose.onnx":
        if model_type == "yolo":
            if model_size == "small":
                model_path = "./models/yolov11s-pose.onnx"
            elif model_size in ("large", "xlarge"):
                model_path = "./models/yolov11l-pose.onnx"
            else:
                model_path = "./models/yolov11s-pose.onnx"
        else: # rtmpose
            if model_size == "small":
                model_path = "./models/rtmpose-s.onnx"
            elif model_size in ("large", "xlarge"):
                model_path = "./models/rtmpose-l.onnx"
            else:
                model_path = "./models/rtmpose-s.onnx"

    # Inject resolved path back into settings for transparency
    settings.onnx_model_path = model_path

    if model_type == "yolo":
        logger.info("Initializing YOLO-Pose Model Adapter (%s size)", model_size)
        return YOLOPoseAdapter(model_path)
    else:
        logger.info("Initializing RTMPose Model Adapter (%s size)", model_size)
        return RTMPoseAdapter(model_path)

