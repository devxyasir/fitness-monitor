# FIX 08 — Ending a meeting doesn't actually end it (room lifecycle)

**Priority:** High (functional + cost). Independent of 03–07; can be done any time after 02.
**Apps touched:** `apps/api` (LiveKit service + sessions service), `apps/web` (ended UX)

---

## 1. Symptom

When the coach clicks **"End Meeting for Everyone,"** students are not reliably removed
from the video call. The LiveKit room keeps running, participants can stay connected, and
if a student's socket happened to be disconnected they never even get the notice. In a
real product (Zoom/Meet) ending a meeting disconnects everyone at the source, instantly.

## 2. Root cause (with evidence)

Ending a session does three things and **misses the most important one**:

- `apps/web/app/session/[id]/page.tsx` → "End Meeting" button calls
  `PATCH /sessions/:id/status {status:'ended'}`.
- `apps/api/src/sessions/sessions.service.ts` → `updateStatus('ended')` sets the DB status
  and calls `egressService.stopSessionEgress(...)` (stops recording).
- `apps/api/src/sessions/sessions.controller.ts` → after the status change, emits
  `emitSessionTerminated(id)` (a socket event).
- The client handles `session:terminated` with a blocking `alert()` then
  `window.location.href = '/dashboard'`.

**The gap:** nothing ever tells **LiveKit** to close the room.
`apps/api/src/media/livekit.service.ts` only mints tokens — it has **no
`RoomServiceClient` and no `deleteRoom`**. So the media room stays alive. Ending the
meeting depends entirely on every client receiving a socket event and voluntarily
navigating away. If a socket is down (see FIX_02), backgrounded, or the tab is a
duplicate, that client stays in a **zombie call**. Authoritative teardown must happen on
the media server.

**Secondary bug — dead/inconsistent room name.** `sessions.service.ts` sets
`session.livekitRoomName = \`room-${uuidv4()}\`` and stores it, but **nothing uses it**.
The real room name everywhere else is `\`session_${sessionId}\`` (see
`egress.service.ts:44/117/211`, `sessions.controller.ts:199`, and the pose worker). So the
stored `livekitRoomName` is misleading. When you add room deletion, you must delete
`session_${id}`, not the stored value.

## 3. The fix

### 3a. Add a canonical room-name helper (kill the inconsistency)

In `apps/api/src/media/livekit.service.ts`, add one source of truth and use it everywhere:

```ts
/** The canonical LiveKit room name for a session. Use this EVERYWHERE. */
export function liveKitRoomName(sessionId: string): string {
  return `session_${sessionId}`;
}
```

Refactor `egress.service.ts`, `sessions.controller.ts` (token generation), and the pose
worker's room name to call/derive from this single convention. Either delete the unused
`livekitRoomName` column or set it to `session_${id}` at create time so it matches reality
— do not leave it as `room-${uuid}`.

### 3b. Give `LiveKitService` the ability to delete a room

Add a `RoomServiceClient` and a `deleteRoom` method:

```ts
import { AccessToken, TrackSource, RoomServiceClient } from 'livekit-server-sdk';

// in constructor, alongside the existing url/key/secret reads:
private readonly roomService: RoomServiceClient | null;
// ...
this.roomService =
  this.apiKey && this.apiSecret
    ? new RoomServiceClient(this.url.replace(/^ws/, 'http'), this.apiKey, this.apiSecret)
    : null;

/** Force-disconnect all participants by deleting the room on the media server. */
async deleteRoom(sessionId: string): Promise<void> {
  if (!this.roomService) {
    this.logger.warn('RoomServiceClient unavailable (no LiveKit creds) — skipping deleteRoom');
    return;
  }
  const room = liveKitRoomName(sessionId);
  try {
    await this.roomService.deleteRoom(room);
    this.logger.log(`Deleted LiveKit room ${room}`);
  } catch (err) {
    // Non-fatal: room may already be gone. Log and continue.
    this.logger.warn(`deleteRoom(${room}) failed: ${err instanceof Error ? err.message : err}`);
  }
}
```

`RoomServiceClient` talks to the LiveKit server's HTTP API (`ws://` → `http://`), which is
already how `EgressClient` is constructed in `egress.service.ts` — mirror that.

### 3c. Call `deleteRoom` when the session ends

In `sessions.service.ts` → `updateStatus`, in the `newStatus === 'ended'` branch, after
stopping egress, delete the room. Inject `LiveKitService` into `SessionsService` (it's
already in `MediaModule`; make sure `SessionsModule` imports it).

```ts
} else if (newStatus === 'ended') {
  session.endedAt = new Date();
}
// ... after save:
if (newStatus === 'ended') {
  await this.egressService.stopSessionEgress(savedSession.id);
  await this.liveKitService.deleteRoom(savedSession.id); // authoritative teardown
}
```

Order: stop egress first (so the recording finalizes), then delete the room. Both are
non-fatal on error. Keep the existing `emitSessionTerminated` socket event — it's now a
fast-path UX nicety, with `deleteRoom` as the guaranteed backstop.

### 3d. Replace the `alert()` with a graceful "meeting ended" screen

In `apps/web/app/session/[id]/page.tsx`, the `session:terminated` handler currently does
`alert(...) + window.location.href`. Replace with a state flag that renders a clean
full-screen "This session has ended" panel with a "Back to dashboard" button (match the
existing `Connection Failed` panel styling). Also, because `deleteRoom` will drop the
LiveKit connection, add a handler for the `<LiveKitRoom>` `onDisconnected` event that, if
the session is ended, shows the same panel rather than an error.

## 4. Files to touch

- [ ] `apps/api/src/media/livekit.service.ts` — `liveKitRoomName()` helper + `RoomServiceClient` + `deleteRoom()` (**required**)
- [ ] `apps/api/src/sessions/sessions.service.ts` — call `deleteRoom` on end; inject `LiveKitService` (**required**)
- [ ] `apps/api/src/sessions/sessions.module.ts` — ensure `MediaModule`/`LiveKitService` is available
- [ ] `apps/api/src/media/egress.service.ts` + pose worker + controller — use `liveKitRoomName()` (consistency)
- [ ] `apps/web/app/session/[id]/page.tsx` — graceful ended screen + `onDisconnected` handling

## 5. Verification

1. Two browsers: coach + student both in a live session, both seeing each other's video.
2. Coach clicks **End Meeting for Everyone**.
3. The **student's** video call drops within ~1s (LiveKit disconnect), even if you first
   **kill the student's socket** in DevTools before ending — proving teardown is
   server-authoritative, not socket-dependent.
4. Both users land on a clean "session ended" screen (no `alert()` dialog).
5. API logs show `Deleted LiveKit room session_<id>` and egress stop.
6. DB: session `status = 'ended'`, `endedAt` set.
7. Confirm no LiveKit egress keeps running afterward (check LiveKit dashboard / logs).

## 6. Do NOT touch

- Don't remove the `session:terminated` socket emit — keep it as the fast path.
- Don't make `deleteRoom`/egress-stop failures throw and block the status change — ending
  must succeed even if LiveKit is unreachable.
- Don't reintroduce `livekitRoomName = room-${uuid}`; standardize on `session_${id}`.

## 7. Acceptance criteria

- Ending a meeting disconnects all participants at the LiveKit source, independent of
  socket state.
- Room name is consistent (`session_${id}`) across token, egress, pose worker, deletion.
- Users see a graceful ended screen; egress and room are both torn down.
