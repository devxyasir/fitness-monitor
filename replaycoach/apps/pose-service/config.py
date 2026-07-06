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
    # Defaults to 'medium' — confirmed via local testing (process_1mp4.py)
    # as the best speed/quality balance; 'large' produced good skeletons too
    # but its extra CPU cost (bigger model + 384x288 input vs medium's
    # 256x192) was enough to starve the shared box and cause Socket.IO ping
    # timeouts elsewhere during a live session while a reference video was
    # processing.
    reference_model_size: str = "medium"
    reference_onnx_model_path: str | None = None
    reference_detector_model_path: str | None = None
    # Tighter bbox-refresh interval than live tracking's 16 — a reused stale
    # box during fast motion sends RTMPose a crop the person has already
    # moved out of, which produces confidently-wrong keypoints scattered off
    # the body regardless of model size. Reference analysis isn't
    # latency-sensitive, so it can afford to re-detect far more often.
    reference_detect_interval_frames: int = 4

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
