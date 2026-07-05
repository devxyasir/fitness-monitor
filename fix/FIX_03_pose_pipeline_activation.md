# FIX 03 — Pose pipeline is disconnected: nothing starts the workers

**Priority:** 3 (do after 01–02; realtime must work first)
**Apps touched:** `apps/api` (new pose-service HTTP client + lifecycle wiring), verify `apps/pose-service`
**Depends on:** FIX_02 (socket delivers the skeletons). Pairs well with FIX_09 (LiveKit webhooks).

---

## 1. Symptom

No skeleton ever appears on any video, even though the Python pose-service, the Redis
relay, and the `SkeletonOverlay` component all exist and look correct. The pipeline is a
set of correctly-built parts with **no trigger connecting them**.

## 2. Root cause (with evidence)

The Python pose-service exposes `POST /workers/{session_id}/{participant_id}/start`
(`apps/pose-service/main.py`) which spawns a `PoseWorker` that subscribes to that
participant's LiveKit track and publishes keypoints to the Redis stream `pose:keypoints`.
The NestJS relay (`apps/api/src/pose/pose-relay.service.ts`) consumes that stream and
emits `pose:update` to clients.

**But nothing ever calls the `start` endpoint.** A repo grep shows `POSE_SERVICE_URL` is
defined in `apps/api/src/config/config.schema.ts` (default `http://localhost:8100`) and is
**used nowhere**. So no worker is ever created → the stream stays empty → the relay's
`xreadgroup` blocks forever → zero skeletons. Same for stopping workers when a participant
leaves (they'd leak).

**Identity contract to preserve:** the worker matches the track by
`participant.identity == participant_id` (`apps/pose-service/worker.py`). Tokens are minted
with `identity = user.sub` (the userId) in `livekit.service.ts`. **So the `participant_id`
you pass to the pose-service must be the userId** — the same value used as the LiveKit
identity. Don't pass a DB participant row id.

## 3. The fix

### 3a. Add a pose-service HTTP client in NestJS

Create `apps/api/src/pose/pose-service.client.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PoseServiceClient {
  private readonly logger = new Logger(PoseServiceClient.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('POSE_SERVICE_URL', 'http://localhost:8100');
  }

  /** Non-fatal: a pose failure must never break live video or recording. */
  async startWorker(sessionId: string, participantId: string): Promise<void> {
    await this.call('start', sessionId, participantId);
  }
  async stopWorker(sessionId: string, participantId: string): Promise<void> {
    await this.call('stop', sessionId, participantId);
  }

  private async call(action: 'start' | 'stop', sessionId: string, participantId: string) {
    const url = `${this.baseUrl}/workers/${sessionId}/${participantId}/${action}`;
    try {
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) this.logger.warn(`pose ${action} -> ${res.status} for ${sessionId}/${participantId}`);
    } catch (err) {
      this.logger.warn(`pose ${action} failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }
  }
}
```

Register it in `PoseModule` providers and export it.

### 3b. Trigger start/stop on participant lifecycle

Use the **LiveKit webhook** as the trigger — it fires exactly when a participant's video
track is actually live, and it's the same webhook you're adding in FIX_09. In the webhook
handler:

- On `participant_joined` (or better, `track_published` for a video track): if the
  identity is **not** a `pose_worker_*` bot, call `poseServiceClient.startWorker(sessionId,
  identity)`. Derive `sessionId` from the room name (`session_<id>` → strip prefix).
- On `participant_left`: call `poseServiceClient.stopWorker(sessionId, identity)`.
- On `room_finished` / session end: the workers stop when the room dies, but also call
  `stopWorker` for any tracked participants and rely on the pose-service's own shutdown.

**If you haven't done FIX_09 yet**, a simpler interim trigger: when the session goes
`live` (`sessions.service.ts` `updateStatus('live')` / instant create), start a worker for
each currently-approved participant, and stop them on `ended`. The webhook approach is more
correct (handles late joiners), so prefer it once FIX_09 lands. Document whichever you use.

Guard against duplicates: the pose-service already no-ops if a worker key exists
(`WorkerPool.add_worker`), so double-starts are safe.

### 3c. Verify the pose-service can actually reach LiveKit and the model loads

- `apps/pose-service/.env` must point `POSE_LIVEKIT_URL/KEY/SECRET` at the same LiveKit
  server the API uses (dev: `ws://localhost:7880`, `devkey`/`secret`).
- The ONNX model file must exist at the resolved path (`config.py` resolves
  `./models/rtmpose-s.onnx` by default). If it's missing, `inference.py` logs
  "model not found — stub mode" and returns **empty** results (no skeleton). Confirm the
  file is present, or FIX_04 will have nothing to correct.
- Note: **correct keypoint values depend on FIX_04.** This brief only makes keypoints
  *flow*; FIX_04 makes them *accurate*. If you want to verify wiring before FIX_04, set
  `POSE_MODEL_TYPE=yolo` with a YOLO-Pose ONNX (its decoder is already correct).

### 3d. Note on DB persistence (not required for live overlay)

`pose.service.ts` `ingestKeypoints` only persists a frame if a `Recording` row with
`trackType: 'track'` exists for that participant; otherwise it logs a warning and skips.
The **live** overlay path (`emitPoseUpdate` → socket) does **not** depend on this, so live
skeletons work regardless. DB-backed replay overlay does — that's handled together with
per-track egress and FIX_06. Don't block this brief on it.

## 4. Files to touch

- [ ] `apps/api/src/pose/pose-service.client.ts` — new HTTP client (**required**)
- [ ] `apps/api/src/pose/pose.module.ts` — provide/export the client
- [ ] Webhook handler (FIX_09) or `sessions.service.ts` — call start/stop (**required**)
- [ ] `apps/pose-service/.env` — verify LiveKit + model path
- [ ] Confirm `POSE_SERVICE_URL` is read (it now is)

## 5. Verification

1. Start API, web, pose-service, LiveKit. Coach + student in a live session.
2. Pose-service logs: `Added pose worker: <session>:<userId>`, then
   `Connected to room session_<id>` and `Track subscribed ... for participant <userId>`.
3. `GET http://localhost:8100/workers` lists the active worker key.
4. Redis: `XLEN pose:keypoints` grows over time (frames are being published).
5. API logs: relay consuming; browser receives `pose:update` events (Network → WS).
6. A skeleton overlay renders over the student's tile (shape may be wrong until FIX_04).
7. Student leaves → pose-service logs `Removed/Cancelled pose worker`.

## 6. Do NOT touch

- Keep pose strictly a **subscriber** — it must never publish or block video/recording.
- Keep all pose-service calls non-fatal in the API (a pose outage cannot break a session).
- Don't pass a DB participant id as `participant_id`; it must equal the LiveKit identity
  (userId).

## 7. Acceptance criteria

- Starting a session spawns pose workers; leaving stops them.
- `pose:keypoints` fills and `pose:update` reaches the browser.
- A skeleton overlay appears live (accuracy handled in FIX_04).
