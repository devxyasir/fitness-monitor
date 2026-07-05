# FIX 06 — Database is the bottleneck (2 queries per pose frame)

**Priority:** 6 (do after the pose pipeline works, 03–04)
**Apps touched:** `apps/api` (pose relay/service, entities/migrations, TypeORM config)

---

## 1. Symptom

DB latency spikes and the pose relay falls behind under even light load. As sessions or
participants increase, keypoint persistence backs up and requests slow down.

## 2. Root cause (with evidence)

**Two DB round-trips per pose frame.** `apps/api/src/pose/pose.service.ts` →
`ingestKeypoints` runs, **for every single frame**:
1. `recordingRepository.findOne({ sessionId, participantId, trackType:'track' })` — a SELECT
2. `poseFrameRepository.save(frame)` — an INSERT

At `POSE_SAMPLE_HZ = 10` and N participants that's **20 × N round-trips per second**, each
to a Supabase Postgres instance in **ap-northeast-1 (Tokyo)** — so every query pays
cross-region latency. This is the dominant cost, not missing indexes.

Secondary: a few hot lookups lack covering indexes (annotations by clip/replay-event,
clip-share IDOR checks), and the TypeORM connection pool size is unset (defaults low).

## 3. The fix

### 3a. Cache the recording lookup (kill query #1)

The `recordingId` for a `(sessionId, participantId, 'track')` doesn't change during a
session. Resolve it once and cache it. Add a small in-memory cache (or Redis) in
`PoseService`:

```ts
private readonly recordingCache = new Map<string, string | null>(); // key: `${sessionId}:${participantId}`

private async resolveRecordingId(sessionId: string, participantId: string): Promise<string | null> {
  const key = `${sessionId}:${participantId}`;
  if (this.recordingCache.has(key)) return this.recordingCache.get(key)!;
  const rec = await this.recordingRepository.findOne({
    where: { sessionId, participantId, trackType: 'track' },
  });
  this.recordingCache.set(key, rec?.id ?? null);
  return rec?.id ?? null;
}
```
Invalidate the entry when the track recording is created (or on session end). For multi-
instance correctness use Redis instead of a `Map` (ties into FIX_07); a `Map` is fine for a
single instance to start.

### 3b. Batch the inserts (kill per-frame INSERTs)

Don't `save()` per frame. Buffer frames and flush in bulk. Since the relay already reads the
Redis stream in batches of 10 (`pose-relay.service.ts`), accumulate and insert with a single
statement:

```ts
// In PoseService: buffer + periodic flush
private buffer: PoseKeypointFrame[] = [];
private flushTimer?: NodeJS.Timeout;

async ingestKeypoints(data: PoseFrameDto): Promise<void> {
  const recordingId = await this.resolveRecordingId(data.sessionId, data.participantId);
  if (!recordingId) return; // no track recording yet — skip (live overlay unaffected)
  const f = new PoseKeypointFrame();
  f.recordingId = recordingId;
  f.frameTimestampMs = data.frameTimestampMs;
  f.keypoints = Object.fromEntries(data.keypoints.map((kp) => [kp.name, [kp.x, kp.y, kp.score]]));
  f.confidenceAvg = data.confidenceAvg;
  this.buffer.push(f);
  if (this.buffer.length >= 50) await this.flush();
  else this.scheduleFlush();
}

private scheduleFlush() {
  if (this.flushTimer) return;
  this.flushTimer = setTimeout(() => this.flush().catch(() => {}), 1000);
}

private async flush() {
  if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = undefined; }
  if (this.buffer.length === 0) return;
  const rows = this.buffer;
  this.buffer = [];
  await this.poseFrameRepository.insert(rows); // one multi-row INSERT
}
```
Flush on module destroy so nothing is lost on shutdown. This turns ~20×N queries/sec into
roughly **1 INSERT/sec per relay**.

### 3c. Optionally downsample DB writes

The socket overlay is 10Hz for smoothness, but replay-from-DB rarely needs 10Hz. Consider
persisting every other frame (5Hz) to halve write volume, while keeping the live socket at
10Hz. Make it a config knob (`POSE_PERSIST_HZ`). Optional.

### 3d. Add the missing indexes

Add a migration (follow the numbered pattern in `apps/api/src/database/migrations/`):
- `annotations (replay_event_id)` and `annotations (clip_id, frame_timestamp_ms)` — replay
  and clip overlays query by these.
- `clip_shares (clip_id, shared_with_user_id)` unique — used on every clip IDOR check.
- `sessions (coach_id)` — coach dashboards list by coach.
- `pose_keypoint_frames (recording_id, frame_timestamp_ms)` already exists — leave it.

### 3e. Tune the connection pool

In the TypeORM setup (`apps/api/src/database/data-source.ts` / the ORM module), set an
explicit pool size and sane timeouts, e.g. `extra: { max: 20, idleTimeoutMillis: 30000 }`.
For high query volume against Supabase, prefer the **transaction pooler (port 6543)** over
the session pooler (5432) for the app's short queries — verify which port `DATABASE_URL`
uses and switch if appropriate. (Migrations should still run against a direct/session
connection.)

## 4. Files to touch

- [ ] `apps/api/src/pose/pose.service.ts` — recording-id cache + batched insert (**required**)
- [ ] `apps/api/src/database/migrations/008_add_perf_indexes.ts` — new indexes (**required**)
- [ ] `apps/api/src/database/data-source.ts` / ORM module — pool sizing; pooler port
- [ ] (Optional) `POSE_PERSIST_HZ` config for downsampled writes

## 5. Verification

1. Run a session with a couple of participants for a minute. Before/after: measure DB write
   rate — you should go from ~20×N queries/sec to ~1–2 INSERT/sec per relay.
2. `EXPLAIN ANALYZE` a replay keypoint range query and a clip-share check — they should use
   the indexes (Index Scan, not Seq Scan).
3. The pose relay keeps up (no growing `XPENDING` backlog on `pose:keypoints`).
4. No data loss: after a session, `SELECT count(*) FROM pose_keypoint_frames WHERE ...`
   roughly matches expected frames (minus any intentional downsampling).
5. All existing API tests still pass.

## 6. Do NOT touch

- Don't make persistence block the live overlay — keep it async/batched off the socket path.
- Don't drop the frame data or change the `keypoints` jsonb shape (name → [x,y,score]).
- Don't run heavyweight synchronous work inside the relay consume loop.

## 7. Acceptance criteria

- Pose persistence is batched (≈1 INSERT/sec/relay) with a cached recording lookup.
- Hot queries are index-backed; pool is sized; pooler port is appropriate.
- No backlog on the Redis stream under normal multi-participant load.
