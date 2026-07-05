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
    # Can be 'small', 'large', or 'xlarge'
    model_size: str = "small"
    onnx_model_path: str = "./models/rtmpose.onnx"

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
    }


settings = Settings()
