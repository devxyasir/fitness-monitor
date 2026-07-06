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

import model_downloader
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


@dataclass
class BoundingBox:
    """A detected person, normalized [0, 1] in full-frame coordinates."""

    x1: float
    y1: float
    x2: float
    y2: float
    score: float


class PoseModelAdapter(abc.ABC):
    """Abstract interface for swappable pose models (RTMPose, YOLO-Pose, etc.)."""

    @abc.abstractmethod
    def load(self) -> None:
        """Load model weights into memory."""

    @abc.abstractmethod
    def infer(self, frame: np.ndarray, track_id: str = "default") -> PoseResult:
        """
        Run inference on a single BGR frame, return normalized keypoints.

        track_id identifies which continuous stream this frame belongs to
        (e.g. "{sessionId}:{participantId}", or a reference-video id).
        A single model instance is shared across concurrent streams (see
        WorkerPool in worker.py), so adapters that keep per-stream tracking
        state (TopDownPoseEstimator) key it by track_id — callers that only
        ever process one stream at a time can ignore this parameter.
        """

    def reset_track(self, track_id: str) -> None:
        """
        Drop any per-stream state for track_id (e.g. a tracked bounding box).
        Call this when a stream ends so state doesn't leak indefinitely.
        No-op for stateless adapters.
        """


class RTMPoseAdapter(PoseModelAdapter):
    """
    RTMPose inference via ONNX Runtime.

    Loads the model once and runs inference per-frame. Outputs COCO-17
    keypoints with coordinates normalized to [0, 1].

    RTMPose uses SimCC (coordinate classification): the model emits two 1-D
    probability-distribution tensors (simcc_x, simcc_y) rather than direct
    (x, y, score) triplets, and expects ImageNet mean/std-normalized RGB input.
    """

    MEAN = np.array([123.675, 116.28, 103.53], dtype=np.float32)
    STD = np.array([58.395, 57.12, 57.375], dtype=np.float32)
    SIMCC_SPLIT_RATIO = 2.0

    def __init__(self, model_path: str | None = None, model_size: str = "medium"):
        self._model_path = model_path or settings.onnx_model_path
        self._model_size = model_size
        self._session = None
        self._input_size = model_downloader.rtmpose_input_size(model_size)  # (H, W)

    def load(self) -> None:
        """Auto-download the model if missing, then load an ONNX Runtime session."""
        import onnxruntime as ort

        model_file = Path(self._model_path)
        if not model_file.exists():
            try:
                model_downloader.ensure_rtmpose_model(self._model_path, self._model_size)
            except Exception:
                logger.exception(
                    "Failed to auto-download RTMPose model (%s) to %s — inference will use stub mode",
                    self._model_size,
                    self._model_path,
                )
                return

        providers = ort.get_available_providers()
        preferred = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        active = [p for p in preferred if p in providers]

        self._session = ort.InferenceSession(str(model_file), providers=active)
        logger.info(
            "RTMPose ONNX model loaded from %s (providers: %s, input=%s)",
            self._model_path,
            active,
            self._input_size,
        )

    def _preprocess(self, frame: np.ndarray) -> np.ndarray:
        """Resize, ImageNet-normalize, and transpose frame for ONNX input (RGB, CHW)."""
        h, w = self._input_size  # (256, 192) = (H, W)
        resized = cv2.resize(frame, (w, h), interpolation=cv2.INTER_LINEAR)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32)
        rgb = (rgb - self.MEAN) / self.STD
        blob = rgb.transpose(2, 0, 1)[None]  # (1, 3, H, W)
        return np.ascontiguousarray(blob, dtype=np.float32)

    def _decode_simcc(self, simcc_x: np.ndarray, simcc_y: np.ndarray) -> PoseResult:
        """Decode SimCC coordinate-classification outputs into normalized keypoints."""
        # shapes: simcc_x (1, K, W*split), simcc_y (1, K, H*split)
        N, K, _ = simcc_x.shape
        x = simcc_x.reshape(N * K, -1)
        y = simcc_y.reshape(N * K, -1)
        x_locs = np.argmax(x, axis=1).astype(np.float32)
        y_locs = np.argmax(y, axis=1).astype(np.float32)
        max_x = np.amax(x, axis=1)
        max_y = np.amax(y, axis=1)
        scores = np.minimum(max_x, max_y)

        # argmax bin -> input-pixel coords
        x_locs /= self.SIMCC_SPLIT_RATIO
        y_locs /= self.SIMCC_SPLIT_RATIO

        in_h, in_w = self._input_size  # (256, 192)
        keypoints: list[KeypointResult] = []
        kept: list[float] = []
        for i, name in enumerate(COCO_KEYPOINT_NAMES):
            score = float(scores[i])
            # normalize to [0,1] in the model input frame
            nx = float(min(max(x_locs[i] / in_w, 0.0), 1.0))
            ny = float(min(max(y_locs[i] / in_h, 0.0), 1.0))
            if score >= settings.min_confidence:
                keypoints.append(KeypointResult(name=name, x=nx, y=ny, score=score))
                kept.append(score)
        return PoseResult(keypoints=keypoints, confidence_avg=float(np.mean(kept)) if kept else 0.0)

    def infer(self, frame: np.ndarray, track_id: str = "default") -> PoseResult:
        """Run single-frame inference. Stateless — track_id is unused."""
        if self._session is None:
            # Stub mode — return empty result when model is not loaded
            return PoseResult()

        blob = self._preprocess(frame)
        input_name = self._session.get_inputs()[0].name
        outputs = self._session.run(None, {input_name: blob})

        if len(outputs) < 2:
            logger.error("RTMPose expected 2 SimCC outputs, got %d", len(outputs))
            return PoseResult()

        a, b = outputs[0], outputs[1]
        in_h, in_w = self._input_size
        # simcc_x last dim == W*split, simcc_y last dim == H*split
        if a.shape[-1] == round(in_w * self.SIMCC_SPLIT_RATIO):
            simcc_x, simcc_y = a, b
        else:
            simcc_x, simcc_y = b, a
        return self._decode_simcc(simcc_x, simcc_y)


class YOLOPoseAdapter(PoseModelAdapter):
    """
    YOLOv11-Pose / YOLOv8-Pose inference via ONNX Runtime.

    Processes single BGR frame, resizing to 640x640, and postprocesses
    to extract the person candidate with the highest bbox confidence.
    """

    def __init__(self, model_path: str | None = None, model_size: str = "medium"):
        self._model_path = model_path or settings.onnx_model_path
        self._model_size = model_size
        self._session = None
        self._input_size = (640, 640)  # Standard YOLO-Pose resolution

    def load(self) -> None:
        """Auto-download the model if missing, then load an ONNX Runtime session."""
        import onnxruntime as ort

        model_file = Path(self._model_path)
        if not model_file.exists():
            try:
                model_downloader.ensure_yolo_pose_model(self._model_path, self._model_size)
            except Exception:
                logger.exception(
                    "Failed to auto-download YOLO-Pose model (%s) to %s — inference will use stub mode",
                    self._model_size,
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

    def infer(self, frame: np.ndarray, track_id: str = "default") -> PoseResult:
        """Run single-frame YOLO inference. Stateless — track_id is unused."""
        if self._session is None:
            return PoseResult()

        input_blob = self._preprocess(frame)
        input_name = self._session.get_inputs()[0].name
        outputs = self._session.run(None, {input_name: input_blob})
        return self._postprocess(outputs[0])


class PersonDetector:
    """
    Localizes the person in a frame using the YOLO-pose model's bounding-box
    head — its own keypoints are discarded; RTMPose is more accurate at
    keypoint localization once given a proper crop. Uses a letterbox resize
    (preserve aspect ratio + pad) rather than a plain squish-resize, since a
    squish distorts the person's proportions before the model ever sees them.
    """

    def __init__(self, model_path: str | None = None, model_size: str = "small"):
        self._model_path = model_path or settings.detector_model_path
        self._model_size = model_size
        self._session = None
        self._input_size = (640, 640)  # (H, W)

    def load(self) -> None:
        import onnxruntime as ort

        model_file = Path(self._model_path)
        if not model_file.exists():
            try:
                model_downloader.ensure_yolo_pose_model(self._model_path, self._model_size)
            except Exception:
                logger.exception(
                    "Failed to auto-download person-detector model (%s) to %s — pose will run "
                    "on whole frames (degrades gracefully, but crops will be less accurate)",
                    self._model_size,
                    self._model_path,
                )
                return

        providers = ort.get_available_providers()
        preferred = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        active = [p for p in preferred if p in providers]
        self._session = ort.InferenceSession(str(model_file), providers=active)
        logger.info("Person detector loaded from %s (providers: %s)", self._model_path, active)

    def _letterbox(self, frame: np.ndarray) -> tuple[np.ndarray, float, float, float]:
        """Resize preserving aspect ratio and pad to the model's square input."""
        h, w = frame.shape[:2]
        in_h, in_w = self._input_size
        scale = min(in_w / w, in_h / h)
        nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
        resized = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_LINEAR)
        pad_x = (in_w - nw) / 2.0
        pad_y = (in_h - nh) / 2.0
        canvas = np.full((in_h, in_w, 3), 114, dtype=np.uint8)
        y0, x0 = int(round(pad_y)), int(round(pad_x))
        canvas[y0:y0 + nh, x0:x0 + nw] = resized
        return canvas, scale, pad_x, pad_y

    def detect(self, frame: np.ndarray) -> BoundingBox | None:
        """Returns the highest-confidence person bbox, normalized [0,1] in full-frame space."""
        if self._session is None:
            return None

        h, w = frame.shape[:2]
        canvas, scale, pad_x, pad_y = self._letterbox(frame)
        rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.transpose(rgb, (2, 0, 1))[None]
        blob = np.ascontiguousarray(blob, dtype=np.float32)

        input_name = self._session.get_inputs()[0].name
        outputs = self._session.run(None, {input_name: blob})
        output = outputs[0]
        if output.ndim != 3:
            return None

        preds = output[0]  # (56, N): cx, cy, w, h, box_score, 17*3 keypoints
        scores = preds[4, :]
        best_id = int(np.argmax(scores))
        best_score = float(scores[best_id])
        if best_score < settings.min_confidence:
            return None

        cx, cy, bw, bh = (float(preds[i, best_id]) for i in range(4))

        # Undo the letterbox transform to get back to original-frame pixels.
        x1 = (cx - bw / 2 - pad_x) / scale
        y1 = (cy - bh / 2 - pad_y) / scale
        x2 = (cx + bw / 2 - pad_x) / scale
        y2 = (cy + bh / 2 - pad_y) / scale

        x1 = max(0.0, min(float(w), x1)) / w
        y1 = max(0.0, min(float(h), y1)) / h
        x2 = max(0.0, min(float(w), x2)) / w
        y2 = max(0.0, min(float(h), y2)) / h
        if x2 <= x1 or y2 <= y1:
            return None

        return BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2, score=best_score)


@dataclass
class _TrackState:
    last_bbox: BoundingBox | None = None
    frames_since_detect: int = 0


class TopDownPoseEstimator(PoseModelAdapter):
    """
    Two-stage top-down pose pipeline: PersonDetector localizes the person,
    then RTMPose runs on a properly cropped region around them, and the
    resulting keypoints are mapped back to full-frame coordinates.

    RTMPose is a top-down keypoint model — it expects a tight single-person
    crop, not a whole scene. Running it directly on a raw frame (the
    previous behavior) squishes the entire frame, background included, into
    its 192x256 input, which is why the skeleton didn't track the subject
    correctly. This crops to the actual detected person first.

    Falls back to whole-frame RTMPose if the detector is unavailable or
    finds no one, so pose still degrades gracefully instead of failing.

    One model instance is shared across every concurrent participant/stream
    (see WorkerPool in worker.py), so the detect-and-track state below is
    keyed by track_id — never held as plain instance fields — or one
    participant's tracked bbox would leak into another's frames.
    """

    # Padding around the detected bbox so limbs near its edges aren't clipped,
    # aligned to the pose model's own training aspect ratio (W:H, derived
    # from its input_size below) so the final crop isn't itself squished
    # before resizing.
    MARGIN_RATIO = 0.25

    # The detector (640x640 YOLO pass) is the expensive part — far slower
    # than RTMPose itself. Re-detecting every frame is not viable for a live
    # system (measured ~16x slower than RTMPose alone). Instead, detect
    # periodically and reuse the last bbox for frames in between — normal
    # video motion doesn't move a person far frame-to-frame. If RTMPose's own
    # confidence on a reused-bbox crop drops (person likely drifted out of
    # it), force an immediate re-detect rather than waiting out the interval.
    DETECT_INTERVAL_FRAMES = 8
    LOW_CONFIDENCE_REDETECT_THRESHOLD = 0.15

    def __init__(
        self,
        rtmpose_path: str | None = None,
        detector_path: str | None = None,
        model_size: str = "medium",
        detector_size: str = "small",
    ):
        self._pose = RTMPoseAdapter(rtmpose_path, model_size=model_size)
        self._detector = PersonDetector(detector_path, model_size=detector_size)
        self._tracks: dict[str, _TrackState] = {}
        # Derived from the pose model's own input resolution (H, W) — e.g.
        # 0.75 for both the 256x192 and 384x288 RTMPose variants.
        pose_h, pose_w = self._pose._input_size
        self.TARGET_ASPECT = pose_w / pose_h

    def load(self) -> None:
        self._pose.load()
        self._detector.load()

    def reset_track(self, track_id: str) -> None:
        self._tracks.pop(track_id, None)

    def _crop_box(self, bbox: BoundingBox, w: int, h: int) -> tuple[int, int, int, int]:
        """Expand bbox by margin, then pad to RTMPose's aspect ratio, in pixel space."""
        bw = (bbox.x2 - bbox.x1) * w
        bh = (bbox.y2 - bbox.y1) * h
        cx = (bbox.x1 + bbox.x2) / 2 * w
        cy = (bbox.y1 + bbox.y2) / 2 * h

        bw *= 1 + self.MARGIN_RATIO * 2
        bh *= 1 + self.MARGIN_RATIO * 2

        # Grow the shorter dimension so the crop matches RTMPose's aspect
        # ratio — avoids distorting the person when resized to 192x256.
        if bw / bh > self.TARGET_ASPECT:
            bh = bw / self.TARGET_ASPECT
        else:
            bw = bh * self.TARGET_ASPECT

        x1 = int(round(max(0.0, cx - bw / 2)))
        y1 = int(round(max(0.0, cy - bh / 2)))
        x2 = int(round(min(float(w), cx + bw / 2)))
        y2 = int(round(min(float(h), cy + bh / 2)))
        return x1, y1, x2, y2

    def infer(self, frame: np.ndarray, track_id: str = "default") -> PoseResult:
        h, w = frame.shape[:2]
        state = self._tracks.setdefault(track_id, _TrackState())

        need_detect = state.last_bbox is None or state.frames_since_detect >= self.DETECT_INTERVAL_FRAMES
        if need_detect:
            detected = self._detector.detect(frame)
            if detected is not None:
                state.last_bbox = detected
            state.frames_since_detect = 0
        else:
            state.frames_since_detect += 1

        bbox = state.last_bbox
        if bbox is None:
            return self._pose.infer(frame)

        x1, y1, x2, y2 = self._crop_box(bbox, w, h)
        if x2 <= x1 or y2 <= y1:
            return self._pose.infer(frame)

        crop = frame[y1:y2, x1:x2]
        crop_result = self._pose.infer(crop)

        if crop_result.confidence_avg < self.LOW_CONFIDENCE_REDETECT_THRESHOLD:
            # The tracked bbox is probably stale (person moved out of it) —
            # force a fresh detection on the next frame instead of waiting
            # out the rest of the interval.
            state.frames_since_detect = self.DETECT_INTERVAL_FRAMES

        crop_w = x2 - x1
        crop_h = y2 - y1
        mapped = [
            KeypointResult(
                name=kp.name,
                x=(x1 + kp.x * crop_w) / w,
                y=(y1 + kp.y * crop_h) / h,
                score=kp.score,
            )
            for kp in crop_result.keypoints
        ]
        return PoseResult(keypoints=mapped, confidence_avg=crop_result.confidence_avg)


def create_model_adapter() -> PoseModelAdapter:
    """Factory to create the designated pose model based on configuration."""
    model_type = settings.model_type.lower()
    model_size = settings.model_size.lower()

    # Determine default paths based on type and size, if not overridden in env
    model_path = settings.onnx_model_path
    if model_path == "./models/rtmpose.onnx":
        if model_type == "yolo":
            if model_size == "small":
                model_path = "./models/yolo11s-pose.onnx"
            elif model_size in ("large", "xlarge"):
                model_path = "./models/yolo11l-pose.onnx"
            else:
                model_path = "./models/yolo11s-pose.onnx"
        else: # rtmpose
            if model_size == "small":
                model_path = "./models/rtmpose-s.onnx"
            elif model_size == "medium":
                model_path = "./models/rtmpose-m.onnx"
            elif model_size in ("large", "xlarge"):
                model_path = "./models/rtmpose-l.onnx"
            else:
                model_path = "./models/rtmpose-m.onnx"

    # Inject resolved path back into settings for transparency
    settings.onnx_model_path = model_path

    # Person-detector path: same size ladder as the pose model (a "large"
    # config now means both stages scale up, not just RTMPose) — remapped
    # only if left at its sentinel default so an explicit env override wins.
    detector_path = settings.detector_model_path
    detector_tier = model_downloader.YOLO_POSE_TIERS.get(model_size, "n")
    if detector_path == "./models/yolo11n-pose.onnx":
        detector_path = f"./models/yolo11{detector_tier}-pose.onnx"
        settings.detector_model_path = detector_path

    if model_type == "yolo":
        logger.info("Initializing YOLO-Pose Model Adapter (%s size)", model_size)
        return YOLOPoseAdapter(model_path, model_size=model_size)
    else:
        logger.info(
            "Initializing top-down RTMPose pipeline (%s size, detector tier=%s): "
            "person detector -> crop -> RTMPose",
            model_size,
            detector_tier,
        )
        return TopDownPoseEstimator(
            rtmpose_path=model_path,
            detector_path=detector_path,
            model_size=model_size,
            detector_size=model_size,
        )

