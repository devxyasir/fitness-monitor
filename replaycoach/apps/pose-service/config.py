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
    # / create_model_adapter()). 'large' is the default — targets a proper
    # server, not the constrained dev laptop this was originally tuned for.
    # Note: OpenMMLab's body7 RTMPose ONNX ladder is s -> m -> x (no
    # separate "l"), so 'large'/'xlarge' both resolve to their biggest
    # export (rtmpose-x, 384x288, "performance" tier).
    model_size: str = "large"
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
