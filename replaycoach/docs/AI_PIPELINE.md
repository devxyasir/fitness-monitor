# AI Pose Detection Pipeline

Status as of the Phase 4 hardening pass. Scope: `apps/pose-service/*` (Python/FastAPI), and the two NestJS/frontend touchpoints needed to close the export-failure loop (`apps/api/src/reference/*`, `apps/api/src/realtime/realtime.gateway.ts`, `apps/web/stores/annotation-tracking-store.ts`, `apps/web/app/session/[id]/hooks/useAnnotationTrackingSocket.ts`).

## Processing flow

Two independent flows share the same model code but differ in how frames arrive and where output goes:

**Live tracking** (`worker.py`): a `PoseWorker` per participant subscribes to their LiveKit camera track, decodes frames via `rtc.VideoStream`, throttles to `sample_hz` (default 10/s), and runs inference in a thread-pool executor (via `asyncio.run_in_executor`) so it never blocks the event loop. Results publish to a Redis stream (`pose:keypoints`) that the NestJS API relays to the frontend over Socket.IO. Workers are started/stopped via a Redis Streams consumer-group (`pose:commands`, group `pose-workers`) — any number of pose-service replicas compete for commands, which is how this is designed to scale horizontally across machines rather than pinning a session to one instance.

**Reference-video analysis** (`reference_processor.py` / `export_renderer.py`): a FastAPI `BackgroundTask` downloads an uploaded/buffered video, reads it frame-by-frame with OpenCV, runs the same inference pipeline per frame (`track_id` = the reference video's own id), and reports back to the API via a webhook callback + direct multipart upload (there's no polling — pose-service calls back out). `export_renderer.py` is a separate, later stage: given a keypoints JSON already produced by the step above plus a coach's joint-attached annotations, it re-renders the source video with the annotations (and optionally skeleton) burned in, muxes the original audio back in via ffmpeg, and uploads the result.

```
Video → Frame Extraction (cv2.VideoCapture) → Pose Detection (PersonDetector → RTMPose)
      → Keypoint Generation (SimCC decode) → Temporal Smoothing/Hold (KeypointSmoother)
      → [reference only] Gap Interpolation → Tracking (bbox reuse, track_id-keyed)
      → Annotation Attachment (joint-name lookup, not pixel coords)
      → Skeleton/Annotation Rendering → Video Encoding (ffmpeg → H.264)
      → Storage Upload (multipart POST to a caller-supplied URL)
      → Frontend Delivery (Socket.IO for live; REST + signed URL for reference)
```

## Model architecture

`inference.py` defines `PoseModelAdapter` (ABC: `load()`, `is_loaded`, `infer()`, `reset_track()`) as the swap point — every call site (`worker.py`, `reference_processor.py`, `export_renderer.py` via keypoints JSON, `main.py`) types against this interface, never a concrete class. Backend selection goes through a small registry (`MODEL_REGISTRY: dict[str, Callable[[dict], PoseModelAdapter]]`, `_build_adapter()`) instead of the hand-written if/else it used to be — adding a backend is: implement `PoseModelAdapter`, write one `_build_*(cfg: dict)` function, add one registry line.

- **Primary**: RTMPose (`RTMPoseAdapter`), two-stage top-down (`TopDownPoseEstimator` = `PersonDetector` crop + `RTMPoseAdapter`), supporting both COCO-17 and Halpe-26 (`keypoint_format` config). This is what `model_type=rtmpose` (the default) resolves to.
- **Fallback**: YOLO-Pose (`YOLOPoseAdapter`), single-stage, `model_type=yolo`. COCO-17 only — Ultralytics' YOLO11-pose checkpoints are COCO-trained, so there's no Halpe-26 export to point at; `_build_yolo_adapter` logs a warning and ignores `keypoint_format` if set to anything else.
- **Future-ready, not yet integrated**: Halpe-68, BlazePose, MoveNet, OpenPose. No verified ONNX export for any of these is wired into `model_downloader.py` today — the registry/ABC is ready to receive them (see the comment block above `MODEL_REGISTRY` in `inference.py`), but claiming support without a real, tested model behind it would be worse than being explicit that this is unimplemented.

GPU: every adapter's `load()` builds its ONNX Runtime session via a shared `_select_providers()` helper, which prefers `CUDAExecutionProvider` whenever `onnxruntime` reports it available and `settings.force_cpu` isn't set. `requirements.txt` currently pins the CPU-only `onnxruntime` package — swapping to `onnxruntime-gpu` on a CUDA-capable host is the entire GPU enablement step; no code changes needed either way.

## Keypoint robustness

- **Confidence filtering**: unchanged — `min_confidence` (default 0.3) drops a keypoint from a single frame's `PoseResult` at decode time.
- **Temporal smoothing** (new — `keypoint_smoothing.py`, `KeypointSmoother`): per `(track_id, joint_name)` exponential moving average (α=0.5) over `(x, y)`, applied inside every `TopDownPoseEstimator.infer()` return path. Cuts frame-to-frame jitter without the tuning burden of a full Kalman/one-euro filter.
- **Short-gap hold** (same module): a joint missing for up to `MAX_HOLD_FRAMES` (5, ≈0.5s at 10Hz) consecutive frames is reissued at its last smoothed position with linearly decaying confidence instead of disappearing; past that it's dropped for real. This is what "gracefully handles temporary detection failures" for live tracking — it's causal (only looks backward), which is the real-time constraint.
- **Gap interpolation** (new — `reference_processor.py`, `_interpolate_short_gaps`): reference-video jobs have the *entire* clip buffered before the keypoints JSON is finalized, so they can do better than hold-last-known — a batch post-pass linearly interpolates a joint's gap of up to 5 frames using both the last-known-good position *and* the next one, tracking actual motion through the gap. Gaps touching either edge of the clip, or longer than the limit, are deliberately left missing rather than extrapolated. Toggle: `POSE_ENABLE_TEMPORAL_SMOOTHING` (default on) gates both this and the live EMA/hold.
- **Occlusion handling**: still implicit (a fully-occluded joint just scores low and is filtered/held/interpolated like any other gap) — there's no distinct "this joint is occluded vs. just noisy" signal, which would need a different kind of model output (visibility flags) than any currently-integrated backend provides.

## Tracking

Single-person-per-`track_id`, bbox-reuse + periodic re-detection (`TopDownPoseEstimator`, `DETECT_INTERVAL_FRAMES=16`, force-redetect below `LOW_CONFIDENCE_REDETECT_THRESHOLD=0.15`) — unchanged in this phase. No multi-person re-identification exists; `PersonDetector` always picks the single highest-scoring bbox. Annotations attach to named joints (`startJoint`/`endJoint`/`midJoint` + a `participantId`/`track_id`), resolved from the keypoints JSON at render/playback time — never raw pixel coordinates — so Shoulder→Wrist, Hip→Knee, Knee→Ankle, elbow-angle, etc. all just reference joint names from `HALPE26_KEYPOINT_NAMES`/`COCO_KEYPOINT_NAMES`.

## Rendering pipeline

`skeleton_drawing.py` (shared by the Full Body overlay burn-in and the optional export skeleton layer) now reads line thickness, joint radius, and the draw-confidence threshold from config (`POSE_SKELETON_LINE_THICKNESS`, `POSE_SKELETON_JOINT_RADIUS`, `POSE_SKELETON_MIN_SCORE` — defaults unchanged from the previous hardcoded constants, so this is a pure extensibility change, not a visual one). Colors remain hardcoded BGR tuples (not a natural env-var shape). `export_renderer.py`'s own annotation-drawing threshold now reads the same `POSE_SKELETON_MIN_SCORE` instead of an independently-hardcoded duplicate that could silently drift out of sync. Video encoding: both the reference overlay and the export renderer produce H.264/yuv420p/+faststart via an ffmpeg subprocess (not OpenCV's own `mp4v` writer, which isn't browser-playable).

## Storage & cleanup

Every temp file (`tempfile.mkstemp`) download/render across `reference_processor.py`/`export_renderer.py` is removed in a `finally` block. Fixed this phase: `export_renderer.py`'s downloaded keypoints JSON (`kp_path`) was previously deleted inline right after a successful `json.load()` — any exception between download and that line (a malformed/truncated JSON) leaked the temp file forever; it's now tracked alongside the other temp paths and always cleaned up. Uploads are direct multipart POSTs to a caller-supplied URL (issued by the NestJS API, not a presigned-S3 scheme on pose-service's side), authenticated by a callback token header.

## API & error handling

- `/health` (liveness, unconditional) and `/ready` (readiness) are separate. `/ready` previously only checked that the model *objects* existed (`_model is not None`) — true even when `load()` had silently failed to download/open the actual ONNX file, leaving the service reporting healthy while `infer()` quietly returned empty results forever. `/ready` now checks the new `PoseModelAdapter.is_loaded` property on both models, so that failure mode is finally observable.
- `/workers/*` previously returned `{"status": "error", ...}` bodies with an implicit HTTP 200 on failure — indistinguishable from success unless a caller parsed the body. Now raises real `HTTPException`s (503 not-ready, 409 at-capacity).
- A global `Exception` handler returns the same `{"status": "error", "message": ...}` shape (500) for anything unhandled, instead of FastAPI's default bare text body.
- `/reference/export` previously had no failure-reporting path at all — an exception was logged and the API was never told, leaving the coach's UI stuck on "Exporting…" indefinitely. It now accepts an optional `callbackUrl` (mirroring `/reference/process`'s existing contract) and posts `{"status": "failed", "reason": ...}` to it on failure; the NestJS API exposes `POST /reference/:refId/export-failed` (callback-token authed) to receive it and emits `reference:export-failed` over the socket, which the frontend now listens for to clear the stuck spinner and show the real error.

## Queue / scalability

The live-worker command stream (`pose:commands`, consumer group `pose-workers`) is already built for horizontal scaling — any number of pose-service replicas share the group and compete for start/stop commands, with a bounded requeue-on-capacity retry (`MAX_COMMAND_RETRIES=20`). Reference-video jobs (`/reference/process`, `/reference/export`) are **not** on this durable path — they're FastAPI `BackgroundTasks`, which have no persistence: a process crash mid-job loses it silently with no record anywhere and no retry. This is a known, deliberately-scoped-out gap for this phase (see Remaining limitations) rather than a partial fix.

## Remaining limitations

- Reference-video jobs (`/reference/process`, `/reference/export`) have no durability across a process crash/restart — unlike the live-worker command stream, there's no persisted job record to recover from. A crash mid-job just loses it; the coach sees the request hang.
- `YOLOPoseAdapter` is COCO-17 only (no Halpe-26 export exists for it); the two-stage RTMPose path remains the only one with full Halpe-26 support.
- No batch inference (one frame per ONNX Runtime call, even for reference-video jobs where all frames are already available up front) — a real throughput lever left untaken this phase.
- Temporal smoothing is a single global EMA constant (α=0.5), not tuned per-joint or per-motion-speed; a fast joint (wrist) and a slow one (hip) get the same smoothing/lag trade-off.
- No multi-person tracking/re-identification — `PersonDetector` always locks onto whichever detection scores highest each re-detect cycle.
- Halpe-68/BlazePose/MoveNet/OpenPose: registry-ready, not implemented (no verified ONNX export sourced/tested).

## Recommendations for future AI enhancements

Durable reference-job queueing (move `/reference/process`/`/reference/export` onto the same Redis Streams pattern the live-worker commands already use, so a crash doesn't silently lose a job); batch inference for reference-video jobs (multiple frames per ONNX Runtime call — real throughput win since the whole clip is available up front, unlike live tracking); per-joint/velocity-aware smoothing (a real one-euro or Kalman filter once there's a corpus of coaching footage to tune against, replacing the current flat-α EMA); a verified Halpe-68 (or BlazePose/MoveNet) ONNX export wired into `model_downloader.py` + `MODEL_REGISTRY` for hand/face-inclusive coaching cues; `onnxruntime-gpu` in a production image once a GPU host is available (zero code change required, see GPU section above); basic multi-person handling (track the highest-IoU-overlap detection with the previous frame's bbox instead of always re-picking the single highest-confidence one) for sessions where more than one person can appear in frame.
