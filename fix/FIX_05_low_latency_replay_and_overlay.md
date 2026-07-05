# FIX 05 — Instant replay shows a black player (build the video buffer + fast overlay)

**Priority:** 5 (the biggest feature fix; do after 01–04)
**Apps touched:** `apps/web` (new buffer manager + replay wiring)
**Depends on:** FIX_02 (socket), FIX_03/04 (skeleton data). 

---

## 1. Symptom

The coach clicks **Replay Last 30s** (or the replay button), everyone switches to the
replay layout, the "DVR PLAYBACK" badge animates — but the video player is **black**. The
skeleton pose data is buffered, but there is no video underneath it.

## 2. Root cause (with evidence)

There is **no video buffer**. The chain breaks at the source:

- `apps/web/app/session/[id]/components/ReplayPanel.tsx` loads replay video by calling
  `getReplayBlob(participantId, startOffset, 0)` from the replay store.
- `apps/web/stores/replay-store.ts` initializes `getReplayBlob` to `null` and exposes a
  setter `setGetReplayBlob`. **Nothing ever calls `setGetReplayBlob`** (repo-wide grep
  confirms), and there is **no `MediaRecorder` / no `TrackBufferManager`** anywhere.
- So `getReplayBlob` is always `null`, the load effect early-returns, and the `<video>`
  element never receives a source.

Also a real bug in the same file: the student-sync handler does
`video.currentTime = payload.timestampMs / 1005` (comment says use 1000) — a ~0.5% drift.

The pose ring buffer in `ReplayPanel` (buffers `pose:update` for 70s) **does** work — so
once video exists, the overlay can sync to it.

## 3. Chosen approach (and the alternative)

**Primary (recommended): in-browser, per-participant rolling buffer.**
Because replay targets **one specific student's** track (not the whole room), the right
tool is a `MediaRecorder` on that participant's subscribed LiveKit MediaStream, keeping a
rolling window of recent chunks in memory. This is what the store stub was designed for,
it's per-participant, and it's genuinely instant (no server round-trip). Build the
`TrackBufferManager` the project docs claimed exists but doesn't.

**Alternative (document, don't build now): HLS DVR window.** Egress already records the
room to S3 as 4s HLS segments, and `ClipPlaybackModal` already plays HLS via `hls.js`. You
could replay from that with `hls.js` seeking. Downside: it records the **composite room**,
not a single participant, and it's a few seconds behind live. Good for full-session DVR and
already-built saved clips — not ideal for per-student instant replay. Keep as a fallback
for "replay older than the buffer window."

## 4. The fix (primary path)

### 4a. Build `TrackBufferManager`

Create `apps/web/app/session/[id]/components/TrackBufferManager.tsx`. It renders **inside**
`<LiveKitRoom>` (so it can access tracks), records each remote participant's video track
into a rolling chunk buffer, and registers a `getReplayBlob` implementation into the store.

Key design:
- Use `useTracks([{ source: Track.Source.Camera }], { onlySubscribed: true })`.
- For each track, attach a `MediaRecorder` to `new MediaStream([track.mediaStreamTrack])`
  with a `timeslice` (e.g. 1000ms) so you get periodic `dataavailable` chunks.
- Keep, per participantId (identity), an array of `{ ts: number, blob: Blob }` (wall-clock
  timestamp per chunk). Evict entries older than the window (e.g. 70s) on each push.
- Implement `getReplayBlob(participantId, fromOffsetMs, toOffsetMs = 0)`:
  - `startTs = Date.now() + fromOffsetMs` (fromOffsetMs is negative, e.g. -30000).
  - `endTs = Date.now() + toOffsetMs`.
  - Concatenate the chunks whose `ts` falls in `[startTs, endTs]` into one `Blob` with the
    recorder's mime type (`video/webm`), return it (or `null` if empty).
- Register/unregister via `useReplayStore.getState().setGetReplayBlob(fn)` on mount/unmount.

Sketch:
```tsx
'use client';
import { useEffect, useRef } from 'react';
import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useReplayStore } from '../../../../stores/replay-store';

type Chunk = { ts: number; blob: Blob };
const WINDOW_MS = 70_000;

export function TrackBufferManager() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }], { onlySubscribed: true });
  const buffers = useRef<Map<string, Chunk[]>>(new Map());
  const recorders = useRef<Map<string, MediaRecorder>>(new Map());
  const mime = useRef<string>('video/webm');

  useEffect(() => {
    for (const t of tracks) {
      const pid = t.participant.identity;
      const mst = t.publication?.track?.mediaStreamTrack;
      if (!mst || recorders.current.has(pid)) continue;

      const stream = new MediaStream([mst]);
      const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8' : 'video/webm';
      mime.current = type;
      const rec = new MediaRecorder(stream, { mimeType: type });
      rec.ondataavailable = (e) => {
        if (!e.data.size) return;
        const arr = buffers.current.get(pid) ?? [];
        arr.push({ ts: Date.now(), blob: e.data });
        const cutoff = Date.now() - WINDOW_MS;
        while (arr.length && arr[0].ts < cutoff) arr.shift();
        buffers.current.set(pid, arr);
      };
      rec.start(1000); // 1s chunks
      recorders.current.set(pid, rec);
    }
    // stop recorders for tracks that went away
    for (const [pid, rec] of recorders.current) {
      if (!tracks.some((t) => t.participant.identity === pid)) {
        rec.stop(); recorders.current.delete(pid);
      }
    }
  }, [tracks]);

  useEffect(() => {
    const getReplayBlob = (participantId: string, fromOffsetMs: number, toOffsetMs = 0): Blob | null => {
      const arr = buffers.current.get(participantId);
      if (!arr || arr.length === 0) return null;
      const start = Date.now() + fromOffsetMs;
      const end = Date.now() + toOffsetMs;
      const parts = arr.filter((c) => c.ts >= start && c.ts <= end).map((c) => c.blob);
      if (parts.length === 0) return null;
      return new Blob(parts, { type: mime.current });
    };
    useReplayStore.getState().setGetReplayBlob(getReplayBlob);
    return () => useReplayStore.getState().setGetReplayBlob(null);
  }, []);

  return null;
}
```

Render `<TrackBufferManager />` inside `<LiveKitRoom>` in
`apps/web/app/session/[id]/page.tsx` (alongside `RoomAudioRenderer`), so it runs for the
whole session, not just during replay.

> **Caveat (be honest with the user):** a concatenated WebM blob from `MediaRecorder`
> chunks plays from the start but seeking within it can be limited (WebM cue data). For a
> ~30s clip with play/pause and the existing speed controls this is fine; precise
> frame-scrubbing may be approximate. If exact scrubbing is required later, switch that
> case to the HLS-DVR alternative. State this limitation; don't over-promise.

### 4b. Fix the seek-drift bug

In `ReplayPanel.tsx`, change `payload.timestampMs / 1005` to `payload.timestampMs / 1000`.

### 4c. Keep the overlay synced (already mostly there)

`ReplayPanel` already syncs the pose ring buffer to `video.currentTime` via `replayStartMs`.
Verify `replayStartMs` is computed from the **same** offset used to slice the blob
(`Date.now() + startOffset`) so skeleton frames line up with the video. With 4a's
timestamps this matches.

### 4d. Low-latency LIVE overlay (the "shown on the popup fast" part)

Separate from replay, make the live skeleton feel instant:
- Keep the pose sample rate at ~10Hz (`POSE_SAMPLE_HZ`); don't lower it.
- The relay → socket path is already direct; ensure `SkeletonOverlay` renders via
  `requestAnimationFrame`/SVG without heavy per-frame allocation.
- Do **not** route the live overlay through the DB — it already goes straight relay→socket.
  (DB is only for replay-from-history; see FIX_06.)

## 5. Files to touch

- [ ] `apps/web/app/session/[id]/components/TrackBufferManager.tsx` — new (**required**)
- [ ] `apps/web/app/session/[id]/page.tsx` — render `<TrackBufferManager/>` inside `<LiveKitRoom>`
- [ ] `apps/web/app/session/[id]/components/ReplayPanel.tsx` — fix `/1005` → `/1000`; verify overlay sync
- [ ] (Optional) HLS-DVR fallback for replays older than the buffer window

## 6. Verification

1. Coach + student live. Wait ~30s so the buffer fills.
2. Coach clicks **Replay Last 30s** on the student's tile → the replay player shows the
   **student's last 30s of video** (not black), with the skeleton overlaid and moving in
   sync.
3. Play/pause, speed (0.5×–2×) work; the seek bar moves.
4. Coach scrubs → student's replay follows (sync), and the timestamp lines up (no ~0.5%
   drift after the `/1000` fix).
5. Return to Live → live tiles resume.
6. Memory: leave a session running 10+ minutes; the buffer stays bounded (~70s window), not
   growing without limit.

## 7. Do NOT touch

- Don't buffer audio or non-camera tracks; camera video only.
- Don't remove the eviction/window cap — an unbounded buffer will OOM the tab.
- Don't route the live overlay through the server DB for latency reasons.

## 8. Acceptance criteria

- Clicking replay shows real per-student video with a synced skeleton — no black player.
- Buffer is memory-bounded; seek drift fixed; live overlay stays low-latency.
