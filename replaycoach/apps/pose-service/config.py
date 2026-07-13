"""
Pose service configuration — loaded from environment variables.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """All configuration knobs for the pose detection service."""

    # LiveKit connection
    livekit_url: str = "ws://localhost:7880"
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    # Redis connection (for publishing keypoints)
    redis_url: str = "redis://localhost:6379"

    # ONNX model configuration
    # Can be 'rtmpose' or 'yolo'
    model_type: str = "rtmpose"
    # Can be 'small', 'medium', 'large', or 'xlarge'. Both the pose model
    # and the person-detector scale with this tier (see model_downloader.py
    # / create_model_adapter()). 'medium' is the default — 'large' pins a
    # full CPU core continuously for live per-participant tracking (10Hz,
    # for the whole meeting duration), which on a shared 2-vCPU box directly
    # starves LiveKit's video encode/relay and causes visible call lag.
    # 'large' is still fine for one-off reference-video analysis (not
    # latency-sensitive) if explicitly requested via env override.
    # Note: OpenMMLab's body7 RTMPose ONNX ladder is s -> m -> x (no
    # separate "l"), so 'large'/'xlarge' both resolve to their biggest
    # export (rtmpose-x, 384x288, "performance" tier).
    model_size: str = "medium"
    # Keypoint format for the LIVE per-participant model. 'halpe26' adds
    # head/neck/pelvis + full feet (heel + toes) on top of COCO-17 — the
    # joints dance analysis needs. Same backbone/input as COCO, negligible
    # extra CPU cost. Set to 'coco17' to revert.
    keypoint_format: str = "halpe26"
    # Sentinel default — create_model_adapter() remaps this to the correct
    # sized file under ./models/ (auto-downloaded there on first run if
    # missing, see model_downloader.py). Override to pin an exact path.
    onnx_model_path: str = "./models/rtmpose.onnx"

    # Person-detector model used to crop a bbox before RTMPose runs (RTMPose
    # is a top-down keypoint model — it needs a single-person crop, not a
    # whole scene). Reuses the YOLO-pose model purely for its bbox head.
    # Sentinel default — remapped by model_size the same way as
    # onnx_model_path (auto-downloaded if missing).
    detector_model_path: str = "./models/yolo11n-pose.onnx"

    # Reference-video (uploaded-video) analysis model tier. Set to 'medium'
    # (256x192 rtmpose-m + yolo11s detector): 'large' (384x288 rtmpose-l +
    # yolo11l) is genuinely higher-res, but on this 2-vCPU box it ran at
    # only ~0.3-0.4 fps, so real clips truncated at the wall-clock budget
    # (returning a partial, shortened overlay video) AND its CPU cost
    # starved the API enough to abort login requests mid-flight during a
    # session. 'medium' is ~3-4x faster, completes full clips, and keeps the
    # box responsive — the right speed/quality balance for this hardware.
    reference_model_size: str = "medium"
    # Keypoint format for reference-video (uploaded/example) analysis —
    # 'halpe26' for the full body + feet skeleton the coaching feature needs.
    reference_keypoint_format: str = "halpe26"
    reference_onnx_model_path: str | None = None
    reference_detector_model_path: str | None = None
    # No override here on purpose — confirmed via local testing
    # (process_1mp4.py, which calls plain create_model_adapter() with zero
    # overrides) that TopDownPoseEstimator's unmodified class default
    # (currently 16, see inference.py) already produces good results;
    # tightening this to re-detect more often was this codebase's own
    # speculative fix for bbox drift on fast motion, but it wasn't actually
    # the settings difference that mattered, and it added meaningful extra
    # CPU cost. Left as None so create_reference_model_adapter() falls back
    # to the same class default live tracking uses.
    reference_detect_interval_frames: int | None = None

    # Sampling rate (inferences per second per participant)
    sample_hz: int = 10

    # Minimum keypoint confidence to include in output
    min_confidence: float = 0.3

    # Skeleton rendering (skeleton_drawing.py) — previously hardcoded module
    # constants; now tunable without a code change (e.g. a thicker line for
    # a low-resolution export, or a stricter draw threshold than the
    # inference-time min_confidence above). Colors are still hardcoded
    # (BGR tuples aren't a natural env-var shape) — see skeleton_drawing.py
    # if those need to become config-driven too later.
    skeleton_line_thickness: int = 2
    skeleton_joint_radius: int = 7
    skeleton_min_score: float = 0.3

    # EMA smoothing + short-gap hold across frames (see keypoint_smoothing.py)
    # — cuts frame-to-frame jitter and rides out brief occlusions/motion-blur
    # misses instead of the joint flickering in and out. Applies to both live
    # tracking and reference-video analysis (both go through
    # TopDownPoseEstimator). Off switch in case a future consumer wants raw
    # unsmoothed per-frame output.
    enable_temporal_smoothing: bool = True

    # Redis stream name for publishing keypoint frames
    redis_stream_key: str = "pose:keypoints"

    # Maximum number of concurrent workers
    max_workers: int = 8

    # Every ONNX Runtime session already auto-prefers CUDAExecutionProvider
    # when available (see inference.py's _select_providers) — GPU support
    # is otherwise entirely a matter of which onnxruntime package is
    # installed (see requirements.txt), not a code change. This is purely
    # an escape hatch to force CPU even when a CUDA provider IS present
    # (e.g. a GPU shared with another process, or debugging a
    # GPU-vs-CPU-only output discrepancy).
    force_cpu: bool = False

    model_config = {
        "env_prefix": "POSE_",
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        # Don't crash on unrelated env vars present in the shell/.env (e.g.
        # Node tooling settings like DOTENV_CONFIG_QUIET) — only POSE_* vars
        # and the fields above are ever read.
        "extra": "ignore",
    }


settings = Settings()
