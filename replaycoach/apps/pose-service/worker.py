"""
Pose detection worker — subscribes to per-participant LiveKit tracks,
samples frames at ~8-10Hz, runs ONNX inference, and publishes keypoints
to a Redis Stream.

This is a SUBSCRIBER ONLY — never in the critical path of live video or
recording. A crash here must not affect either (09 §7, FR-6.4).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

import cv2
import numpy as np
import redis.asyncio as aioredis

from config import settings
from inference import PoseModelAdapter

logger = logging.getLogger(__name__)


class PoseWorker:
    """
    Subscribes to a single participant's LiveKit video track,
    samples frames at the configured Hz, runs inference, and publishes
    keypoint results to Redis Streams.
    """

    def __init__(
        self,
        session_id: str,
        participant_id: str,
        redis_client: aioredis.Redis,
        model: PoseModelAdapter,
    ):
        self.session_id = session_id
        self.participant_id = participant_id
        self.redis = redis_client
        self.model = model
        self._running = False
        self._interval = 1.0 / settings.sample_hz
        self._room = None

    async def start(self) -> None:
        """
        Main processing loop. Connects to the LiveKit room, subscribes to the
        target participant's track, and runs real-time skeleton inference.
        """
        self._running = True
        logger.info(
            "PoseWorker started for session=%s participant=%s at %dHz",
            self.session_id,
            self.participant_id,
            settings.sample_hz,
        )

        # 1. Generate local LiveKit token for this worker
        from livekit import api
        token = (
            api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
            .with_identity(f"pose_worker_{self.session_id}_{self.participant_id}")
            .with_name("Pose Worker")
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=f"session_{self.session_id}",
                    can_subscribe=True,
                    can_publish=False,
                    can_publish_data=True,
                )
            )
        )
        token_str = token.to_jwt()

        # 2. Connect to the room
        from livekit import rtc
        self._room = rtc.Room()

        video_track = None
        track_event = asyncio.Event()

        @self._room.on("track_subscribed")
        def on_track_subscribed(
            track: rtc.Track,
            publication: rtc.TrackPublication,
            participant: rtc.RemoteParticipant,
        ):
            nonlocal video_track
            if (
                participant.identity == self.participant_id
                and track.kind == rtc.TrackKind.KIND_VIDEO
            ):
                logger.info(
                    "Track subscribed event for participant %s", self.participant_id
                )
                video_track = track
                track_event.set()

        try:
            logger.info("Connecting worker to room session_%s", self.session_id)
            await self._room.connect(settings.livekit_url, token_str)
            logger.info("Connected to room session_%s", self.session_id)

            # Check if participant is already in the room and has published their video track
            for rp in self._room.remote_participants.values():
                if rp.identity == self.participant_id:
                    for pub in rp.track_publications.values():
                        if pub.track and pub.track.kind == rtc.TrackKind.KIND_VIDEO:
                            logger.info(
                                "Found existing video track for participant %s",
                                self.participant_id,
                            )
                            video_track = pub.track
                            track_event.set()
                            break

            # If track is not yet found, wait for track_subscribed event
            if not video_track:
                logger.info(
                    "Waiting for video track from participant %s", self.participant_id
                )
                try:
                    await asyncio.wait_for(track_event.wait(), timeout=15.0)
                except asyncio.TimeoutError:
                    logger.warning(
                        "Timeout waiting for video track from participant %s",
                        self.participant_id,
                    )

            if not video_track:
                logger.error(
                    "No video track found or subscribed for participant %s",
                    self.participant_id,
                )
                return

            # Start video stream on the track
            stream = rtc.VideoStream(video_track)
            last_inference_time = 0.0

            async for frame_event in stream:
                if not self._running:
                    break

                # Throttle to target sample rate
                now = time.monotonic()
                elapsed = now - last_inference_time
                if elapsed < self._interval:
                    continue

                last_inference_time = now
                timestamp_ms = int(time.time() * 1000)

                # Get Frame, convert to RGBA, and extract Numpy array
                frame = frame_event.frame
                rgba_frame = frame.convert(rtc.VideoBufferType.RGBA)
                w, h = rgba_frame.width, rgba_frame.height

                np_rgba = np.frombuffer(rgba_frame.data, dtype=np.uint8).reshape(
                    (h, w, 4)
                )
                bgr_frame = cv2.cvtColor(np_rgba, cv2.COLOR_RGBA2BGR)

                # Run inference
                result = await asyncio.get_event_loop().run_in_executor(
                    None, self.model.infer, bgr_frame
                )

                if not result.keypoints:
                    continue

                # Publish to Redis Stream
                payload = {
                    "sessionId": self.session_id,
                    "participantId": self.participant_id,
                    "frameTimestampMs": timestamp_ms,
                    "keypoints": [
                        {
                            "name": kp.name,
                            "x": round(kp.x, 4),
                            "y": round(kp.y, 4),
                            "score": round(kp.score, 4),
                        }
                        for kp in result.keypoints
                    ],
                    "confidenceAvg": round(result.confidence_avg, 4),
                }

                await self.redis.xadd(
                    settings.redis_stream_key,
                    {"data": json.dumps(payload)},
                    maxlen=10000,
                )

        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception(
                "PoseWorker error for session=%s participant=%s",
                self.session_id,
                self.participant_id,
            )
        finally:
            if self._room:
                await self._room.disconnect()
            logger.info(
                "PoseWorker stopped for session=%s participant=%s",
                self.session_id,
                self.participant_id,
            )

    def stop(self) -> None:
        """Signal the worker to stop processing."""
        self._running = False


class WorkerPool:
    """Manages a pool of PoseWorker instances, one per active participant track."""

    def __init__(self, redis_client: aioredis.Redis, model: PoseModelAdapter):
        self.redis = redis_client
        self.model = model
        self._workers: dict[str, PoseWorker] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def _worker_key(self, session_id: str, participant_id: str) -> str:
        return f"{session_id}:{participant_id}"

    async def add_worker(self, session_id: str, participant_id: str) -> None:
        """Spin up a worker for a new participant track."""
        key = self._worker_key(session_id, participant_id)
        if key in self._workers:
            logger.warning("Worker already exists for %s", key)
            return

        if len(self._workers) >= settings.max_workers:
            logger.warning(
                "Max workers (%d) reached, cannot add worker for %s",
                settings.max_workers,
                key,
            )
            return

        worker = PoseWorker(session_id, participant_id, self.redis, self.model)
        self._workers[key] = worker
        self._tasks[key] = asyncio.create_task(worker.start())

        logger.info("Added pose worker: %s", key)

    async def remove_worker(self, session_id: str, participant_id: str) -> None:
        """Stop and remove a worker for a participant that left."""
        key = self._worker_key(session_id, participant_id)
        worker = self._workers.pop(key, None)
        task = self._tasks.pop(key, None)

        if worker:
            worker.stop()
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        logger.info("Removed/Cancelled pose worker for: %s", key)

    async def shutdown(self) -> None:
        """Gracefully stop all workers."""
        logger.info("Shutting down worker pool (%d workers)", len(self._workers))
        for worker in self._workers.values():
            worker.stop()

        for task in self._tasks.values():
            task.cancel()

        await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        self._workers.clear()
        self._tasks.clear()
