"""
Temporal smoothing + short-gap hold for per-frame keypoints.

RTMPose (like any single-frame model) has no memory across frames — every
detection is fully independent, so keypoint coordinates visibly jitter
frame-to-frame even when the body is still, and a keypoint that drops below
min_confidence for even a single frame (motion blur, a brief occlusion, a
fast gesture) simply vanishes from that frame's output, reading as skeleton
"flicker" during playback. This module addresses both, per (track_id,
joint_name):

  - Smoothing: an exponential moving average over (x, y). Deliberately not
    a full Kalman/one-euro filter — those need per-joint velocity tuning to
    avoid introducing lag on fast motion, and there's no corpus of real
    coaching footage here to tune against yet. EMA is the safe, low-risk
    default, and it's trivially swappable for a fancier filter later
    without touching any call site: KeypointSmoother.smooth() takes a
    PoseResult and returns a PoseResult, same contract either way.
  - Short-gap hold: if a joint is missing/low-confidence for up to
    MAX_HOLD_FRAMES consecutive frames, its last smoothed position is
    reissued (at a decaying confidence) instead of disappearing outright;
    past that, it's dropped for real — the person may have actually turned
    away or left frame, and holding a stale position indefinitely would be
    worse than just not drawing it.

Stateful per track_id, with the same lifecycle as TopDownPoseEstimator's
own bbox-tracking state — reset_track() must be called together with it
(see inference.py, which owns both).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # Type-only — inference.py imports this module, so a module-level
    # runtime import back would be circular. Deferred to inside smooth()
    # instead (inference.py is always fully loaded by the time anything
    # actually calls smooth(), just not necessarily while it's still being
    # imported).
    from inference import KeypointResult, PoseResult


@dataclass
class _JointState:
    x: float
    y: float
    score: float
    missed_frames: int = 0


class KeypointSmoother:
    # Weight on the NEW sample each frame — lower = smoother but laggier.
    # 0.5 halves jitter amplitude without perceptible lag at typical
    # human movement speed and this service's live sample_hz (10).
    EMA_ALPHA = 0.5

    # ~0.5s at the default live sample_hz (10) — long enough to ride out a
    # blink-length occlusion or a motion-blur frame, short enough that a
    # genuinely-gone joint doesn't hang around as a frozen ghost limb.
    MAX_HOLD_FRAMES = 5

    def __init__(self) -> None:
        self._tracks: dict[str, dict[str, _JointState]] = {}

    def reset_track(self, track_id: str) -> None:
        self._tracks.pop(track_id, None)

    def smooth(self, track_id: str, result: "PoseResult") -> "PoseResult":
        from inference import KeypointResult, PoseResult

        state = self._tracks.setdefault(track_id, {})
        seen_this_frame = {kp.name for kp in result.keypoints}
        smoothed: list[KeypointResult] = []

        for kp in result.keypoints:
            prev = state.get(kp.name)
            if prev is None:
                x, y = kp.x, kp.y
            else:
                x = prev.x + self.EMA_ALPHA * (kp.x - prev.x)
                y = prev.y + self.EMA_ALPHA * (kp.y - prev.y)
            state[kp.name] = _JointState(x=x, y=y, score=kp.score, missed_frames=0)
            smoothed.append(KeypointResult(name=kp.name, x=x, y=y, score=kp.score))

        # Hold recently-seen joints that dropped out of this frame's result.
        for name, prev in list(state.items()):
            if name in seen_this_frame:
                continue
            prev.missed_frames += 1
            if prev.missed_frames > self.MAX_HOLD_FRAMES:
                del state[name]
                continue
            held_score = max(0.0, prev.score * (1 - prev.missed_frames / (self.MAX_HOLD_FRAMES + 1)))
            smoothed.append(KeypointResult(name=name, x=prev.x, y=prev.y, score=held_score))

        confidence_avg = (sum(k.score for k in smoothed) / len(smoothed)) if smoothed else 0.0
        return PoseResult(keypoints=smoothed, confidence_avg=confidence_avg)
