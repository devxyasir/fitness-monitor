# Meeting, Replay & Annotation Architecture

Status as of the Phase 3 pass. Scope: live meeting UX (LiveKit/WebRTC), the
in-meeting instant-replay workflow, and the live annotation system used
during that replay. Does **not** cover the separate reference-video system
(`ReferenceAnalysisModal.tsx` / `AnnotationTrackingModal.tsx`, joint-attached
annotations on an *uploaded* video) — that's a different pipeline with its
own docs context from an earlier phase.

## Meeting architecture

`apps/web/app/session/[id]/page.tsx` is the room. It fetches a LiveKit join
token from `POST /sessions/:id/join` (`useLiveKitRoom.ts`) and mounts
`<LiveKitRoom>` from `@livekit/components-react`, which provides Room
context to everything inside it (`VideoGrid`, `TrackBufferManager`,
`Roster`, `ConnectionStatusBanner`, the annotation/replay components).

`options={{ adaptiveStream: true, dynacast: true }}` is now set on
`<LiveKitRoom>` — the server only pushes each subscribed track at the
resolution it's actually rendered at, and pauses simulcast layers nobody
has visible. Pure bandwidth/CPU savings, no behavior change.

Token issuance (`apps/api/src/media/livekit.service.ts`): 2h TTL,
`roomAdmin: true` only for the coach, `canPublishSources` restricted to
camera+mic for students (screen share is coach-only at the grant level,
matching the UI). `removeParticipant(sessionId, identity)` (new this phase)
lets the coach force one participant out via `RoomServiceClient` — a host
control, not a ban; they can rejoin normally afterward.

**Connection status**: `ConnectionStatusBanner.tsx` uses
`useConnectionState()`/`useConnectionQualityIndicator()` to surface LiveKit's
own (already-working) reconnect handling, which was previously invisible —
no banner, no indicator, nothing distinguished "frozen" from "reconnecting."
Socket.IO reconnection (`lib/socket-client.ts`) is separate and unrelated —
it just rejoins the realtime room on every `connect` event; still no visible
UI for that specific case, only for the WebRTC layer.

**Local camera unmirroring**: `local-camera-unmirror` (globals.css) forces
the local self-view to true orientation (matching what remote viewers see
and keeping pose-skeleton alignment correct) — pre-existing from an earlier
phase, unchanged.

## Replay flow — was dead, now wired

Two separate "review what just happened" tools exist and are meant to
coexist:

1. **"Analyze Last 10s"** (`VideoGrid.tsx`) — uploads the buffered clip to
   the reference-video pipeline: pose-service processing, joint-tracked
   annotations, a permanent saved Clip. Slower (upload + processing
   latency) but produces a durable, exportable artifact.
2. **"Replay"** (new this phase, `VideoGrid.tsx` → `POST
   /sessions/:id/replay/seek` → `ReplayService.seekReplay`) — the instant,
   zero-reprocessing DVR replay: slices straight from each client's local
   rolling buffer (`TrackBufferManager`), no upload, no server round trip
   for the video itself. This is what the backend
   (`ReplayController`/`ReplayService`/`ReplayEvent`/`ReplayPanel.tsx`) was
   actually built for — **but had no UI trigger anywhere before this
   phase**, confirmed by grep across the whole frontend. It's wired up now.

Flow: coach clicks **Replay** on a tile → `POST /replay/seek` → server
broadcasts `session:replay:start` to the whole session room → every
client's `useReplaySocket` flips `useReplayStore.mode` to `'playing'` →
`page.tsx` swaps `VideoGrid` for `ReplayPanel` for everyone. The live
meeting itself is untouched underneath — nobody disconnects, camera/mic
publishing continues, `ReplayPanel` is just a different view layered over
the same `<LiveKitRoom>`. Coach's "Return to Live"
(`POST /sessions/:id/replay/end`) broadcasts `session:replay:end` and
everyone flips back.

**Buffer fix**: `TrackBufferManager` previously only recorded *remote*
camera tracks. If a replay targeted a student (broadcast to the whole
room), that student's own client had no buffer of their own camera and
would render blank — everyone else watching them would work fine, just
not the student themselves. Now records the local track too.

**Sync**: `ReplayTargetPicker` + `POST /replay/target` lets the coach
re-seek specific students' `ReplayPanel` to a new timestamp
(`replay:seek`, targeted per-participant room) — e.g. scrubbing the
timeline while pointing out a specific frame. Pose overlay during replay
is reconstructed from a 70s ring buffer of `pose:update` events kept
inside `ReplayPanel` itself, resynced to `usePoseStore` on every
`timeupdate` — this is also what makes joint-attached annotations possible
during replay (see below).

**Polish added this phase**: explicit loading/unavailable states (was a
silent blank video), keyboard shortcuts (Space play/pause, ←/→ seek 5s,
Esc return to live for the coach), a keyboard-shortcut hint, and an
open/enter animation.

## Annotation system

Two independent shape families, both persisted to the same `annotations`
table (`apps/api/src/database/entities/others.entities.ts`):

- **Momentary** (pen, text, or any shape drawn without landing near a
  detected joint): visible only at the exact `frameTimestampMs` it was
  drawn on — a telestrator mark for one specific paused moment. Unchanged
  behavior from before this phase.
- **Joint-attached** (line/arrow/circle/angle/point drawn with an endpoint
  within snap range of a live pose keypoint): `persistUntilCleared = true`
  — visible on every frame from creation onward, with its position
  re-resolved from the live pose buffer each frame instead of being a
  fixed pixel coordinate. If a joint's confidence drops below the same
  `MIN_SCORE` threshold the reference system uses, the shape is skipped
  for that frame rather than shown at a stale/wrong position.

Snapping is automatic, not a separate mode: `AnnotationCanvas.tsx` checks
`findNearestJoint()` (shared helper, `skeletonGeometry.ts`) against
whichever pose frame `ReplayPanel` currently has synced into
`usePoseStore` for the replayed participant. Within ~26px of a keypoint,
the shape's endpoint locks to that joint's name (`geometry.jointRef`);
otherwise it's a plain pixel coordinate, exactly like before.

Tools: Pen, Line, Arrow, Circle, Angle (3-click), Point, Text — Line/Angle/
Point are new this phase. Also new: a thickness picker (was hardcoded to
3px), select + delete of an individual annotation (was only "undo the
most recent" or "clear everything on this exact frame"), and redo.
`color`/`thickness` are now persisted columns (previously broadcast live
but never saved — a reload or late join fell back to a hardcoded default).

## Synchronization

- **Broadcast**: `annotation:draw`/`undo`/`clear`/`delete` (last one new
  this phase) all re-validate server-side that the emitting socket's user
  is actually the session's coach (or a platform_admin) before fanning
  out — the client-claimed role is never trusted.
- **Self-echo fix**: broadcasts now use `client.to(room)`, not
  `server.to(room)`. The drawing coach already appends their stroke
  optimistically; `server.to()` would also deliver it back to their own
  socket, producing a visible duplicate. `client.to()` excludes the
  sender.
- **Stable ids**: every annotation gets a client-generated UUID *before*
  the broadcast goes out (not after the DB write, which stays
  fire-and-forget for latency) — the same id is used for the DB row too.
  Every recipient (including the drawer's own optimistic copy) can now
  de-dupe by id, and delete/select operate on a real, stable identifier
  instead of "the most recent" or "everything on this frame."
- **Late-join sync**: `GET /sessions/:id/annotations` existed but was
  never called from the frontend — a participant who joined after shapes
  were drawn saw nothing until the next live draw. `useAnnotationSocket`
  now calls it (`syncAnnotations`) when `AnnotationCanvas` mounts, and
  `setAnnotations` — also previously dead — populates the store from it.
- **Rate limiting**: unchanged, 30 `annotation:draw` events/sec/socket.

## Remaining issues (not addressed this phase)

- No drag-to-reposition of an already-placed annotation — select + delete
  covers "get rid of a mistake," but not "nudge it." Scoped out given
  joint-attached shapes reposition themselves anyway and momentary marks
  are meant to be redrawn, not edited.
- No device picker (camera/mic/speaker selection) or pre-join device
  preview — still absent, flagged but not built this phase.
- No chat, reactions, or raise-hand — explicitly "future-ready
  placeholder" scope in the request, not implemented.
- Remote mute-a-participant (as opposed to remove-a-participant, which
  *is* implemented) needs track-SID-level `RoomServiceClient` calls and
  was scoped out for time.
- `annotation:undo` (frame+user matching) still exists server-side
  alongside the new id-based `annotation:delete` — the frontend no longer
  calls the former (Undo now deletes by id), but the old handler/service
  method wasn't removed, to keep this phase's diff focused. Worth a
  cleanup pass later.
