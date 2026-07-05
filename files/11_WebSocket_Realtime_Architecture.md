# 11 — WebSocket Realtime Architecture

## 1. Purpose

Carry every low-latency, non-media event that doesn't belong on the WebRTC media path: pose keypoints, replay targeting/state, annotations, presence, and session control signals.

## 2. Technology

Socket.IO on top of NestJS (`@nestjs/websockets`), with the **Redis adapter** so events broadcast correctly across multiple horizontally-scaled gateway instances (see `03_System_Architecture.md` §6).

## 3. Room/Channel Model

| Channel pattern | Purpose | Who's in it |
|---|---|---|
| `session:{id}` | Session-wide events (participant joined/left, session ending) | All participants |
| `session:{id}:coach` | Coach-only control channel | Coach only |
| `session:{id}:participant:{userId}` | Per-student targeted channel | That specific student + coach |

This channel structure is what makes targeted replay (FR-5.2) and per-student pose overlays possible without every event being broadcast to everyone.

## 4. Event Catalog

| Event | Direction | Payload | Notes |
|---|---|---|---|
| `presence:join` / `presence:leave` | Server → all | `{userId, timestamp}` | |
| `pose:update` | Server → per-participant channel + coach | `{participantId, keypoints, timestamp}` | Throttled at source (`09_Pose_Detection_Service.md` §4) |
| `replay:start` | Server → targeted student channels | `{participantId, manifestUrl, seekMs}` | Triggered by coach REST call, fanned out here |
| `replay:seek` | Server → targeted channels | `{seekMs}` | Coach scrubs during an active replay |
| `replay:end` | Server → targeted channels | `{}` | Return-to-live signal |
| `annotation:draw` / `undo` / `clear` | Coach → server → targeted channels | see `10_Annotation_System.md` | Coach-only, server-enforced |
| `session:ending` | Server → all | `{reason}` | Grace-period/explicit end warning |

## 5. Authentication on Connect

- Socket connection handshake includes the short-lived JWT access token (query param or auth payload, never a long-lived credential).
- Gateway validates the token and resolves `userId`/`role` once at connect time, then auto-joins the appropriate channels (§3) based on their verified session participation (re-using the same policy check as `06_Authentication_Authorization_RBAC.md` §4) — never trusts a client-requested room name blindly.
- Reconnection re-runs the same handshake/authorization, so a revoked/expired token can't silently keep an active socket alive past its intended lifetime (bounded by access-token TTL, with a lightweight re-auth ping).

## 6. Scaling & Delivery Guarantees

- Redis pub/sub adapter ensures a broadcast to `session:{id}:participant:{userId}` reaches the correct client regardless of which gateway pod they're connected to.
- Events like `pose:update` are treated as **best-effort/ephemeral** (dropping a frame is fine — the next one arrives in ~100ms) — no delivery guarantee/retry needed, keeping the hot path simple and fast.
- Events like `annotation:draw` are treated as **at-least-once** from the client's perspective (client-side ack + retry on send failure) since losing an annotation stroke is a visible UX defect, unlike a single dropped pose frame.

## 7. Security Considerations

- Every inbound event handler re-validates the sender's role/session membership server-side (never assume "if they're in the room, they're authorized for every action in it" — e.g., a student socket in `session:{id}` must still be rejected from emitting `annotation:draw`).
- Rate-limit inbound events per connection (e.g., max annotation events/sec) to prevent a compromised/malicious client from flooding the gateway.

## 8. Performance Considerations

- Keep payloads small — pose keypoints as compact arrays, not verbose named objects, given the ~8-10Hz per-participant frequency at scale (NFR §2 concurrent sessions).
- Co-locate the WebSocket gateway pods in the same region/AZ as the Redis cluster to minimize adapter round-trip overhead.

## 9. Common Pitfalls

- ❌ Letting clients specify arbitrary room names to join (must be server-derived from verified session membership).
- ❌ Treating all events with the same delivery-guarantee policy — over-engineering retry logic for ephemeral pose data wastes bandwidth; under-engineering it for annotations creates visible bugs.
- ❌ Single-instance Socket.IO deployment without the Redis adapter — breaks the moment you scale beyond one gateway pod.

## 10. Acceptance Criteria

- [ ] Socket connections are authenticated and auto-joined only to channels the user is authorized for.
- [ ] Horizontal scaling test: events correctly reach clients connected to a different gateway pod than the sender (Redis adapter verified under load).
- [ ] Non-coach senders are rejected for coach-only events at the gateway level.
- [ ] Reconnect after network blip resumes correct channel membership without manual client re-subscription logic.
