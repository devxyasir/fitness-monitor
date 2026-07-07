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

    # Reference-video (uploaded-video) analysis has no real-time deadline,
    # unlike live per-participant tracking — a one-off upload can afford a
    # much larger/more accurate model. This was never actually wired to its
    # own model before: both paths shared the single `model_size`-driven
    # instance, so when live tracking got downgraded to 'small' for CPU
    # reasons, reference analysis silently inherited that too, producing
    # skeletons that visibly drifted off the body on fast/acrobatic motion
    # (e.g. pole-dance spins) — a stale/low-res crop, not a code bug.
    # Defaults to 'large' — this is the exact setting process_1mp4.py uses
    # locally: that script calls plain create_model_adapter() with zero
    # overrides, so it's governed by this machine's own pose-service .env,
    # which has POSE_MODEL_SIZE=large. An earlier revision of this default
    # ('medium') was based on an incorrect assumption that the script used
    # config.py's code-level default rather than the local .env override —
    # 'large' is genuinely a better-quality tier (384x288 input + a bigger
    # detector/pose model), not a placebo. Its extra CPU cost did cause
    # Socket.IO ping timeouts on the shared box during a live session while
    # a reference video was processing — if that recurs, the fix should be
    # elsewhere (e.g. giving pose-service a dedicated CPU budget), not
    # silently downgrading this and losing quality again.
    reference_model_size: str = "large"
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

    # Redis stream name for publishing keypoint frames
    redis_stream_key: str = "pose:keypoints"

    # Maximum number of concurrent workers
    max_workers: int = 8

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
