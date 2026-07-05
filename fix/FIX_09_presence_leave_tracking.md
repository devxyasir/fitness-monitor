# FIX 09 — Presence & "leave" tracking is broken (roster, cleanup, cost)

**Priority:** High (functional + cost). Do after FIX_08 (shares LiveKit wiring).
**Apps touched:** `apps/api` (LiveKit webhook, sessions), `apps/web` (roster + leave calls)

---

## 1. Symptom

- The system never records when someone leaves. Everyone appears "still in the session"
  forever in the database.
- If the coach just closes the tab (instead of clicking End), the session stays **live**
  and **egress keeps recording indefinitely** — burning S3 + LiveKit egress cost.
- There's no live "who's in the room" roster / participant count, which every Zoom-like
  product has.

## 2. Root cause (with evidence)

**Leave is never recorded.** `POST /sessions/:id/leave` exists
(`sessions.controller.ts:214` → `sessions.service.ts` `leave()` sets `leftAt`), but a repo
grep shows the **frontend never calls it**. In `apps/web/app/session/[id]/page.tsx`, every
exit path — the "Leave Room" button, "Just Leave Meeting", and closing the tab — just does
`window.location.href = '/dashboard'`. So `leftAt` stays `NULL` for everyone. This is why
`isParticipant` (`status:'approved', leftAt:IsNull()`) and the roster are wrong.

**No cleanup when the room empties or the host leaves.** Egress is only stopped on an
explicit `status:'ended'` transition (`sessions.service.ts` `updateStatus`). Nothing
watches for "room is now empty" or "coach left," so an abandoned session records forever.

**No presence source.** The UI derives tiles from LiveKit tracks but shows no roster,
count, or join/leave feedback.

## 3. The fix

Do this in two layers: an **authoritative** server-side presence signal from LiveKit
(the Zoom-grade way), plus **best-effort** client leave calls for snappy UX.

### 3a. Authoritative presence via LiveKit webhooks (server)

There is already an egress webhook controller (`apps/api/src/media/egress-webhook.controller.ts`)
that receives LiveKit webhook events. LiveKit also emits room/participant lifecycle
events: `participant_joined`, `participant_left`, `room_finished`. Handle them (in that
controller or a sibling `LiveKitWebhookController`) using the SDK's `WebhookReceiver` to
verify the signature:

- `participant_left` → resolve the session from `event.room.name` (strip the
  `session_` prefix) and the participant identity (which is the userId), then set that
  participant's `leftAt = now` via `sessionsService.leave(sessionId, userId)` (make it
  idempotent — no-op if already left).
- `room_finished` **or** `participant_left` that drops the room to **zero non-bot
  participants** → treat the session as over: stop egress and, if still `live`, transition
  to `ended` (reuse `updateStatus`). Ignore the pose worker identities
  (`pose_worker_*`) when counting real participants.

This makes presence and cost-control independent of the browser — even a hard crash or
network drop is caught.

> Requires the LiveKit server to be configured to POST webhooks to the API's webhook URL.
> Confirm/whitelist the path in `main.ts` (raw body is already enabled for webhooks).

### 3b. Best-effort client leave (snappy UX)

In `apps/web/app/session/[id]/page.tsx`:

1. Make the exit buttons call the API before redirecting:
   ```ts
   const leaveAndExit = async () => {
     try { await apiClient.post(`/sessions/${sessionId}/leave`, {}); } catch {}
     window.location.href = '/dashboard';
   };
   ```
   Wire this to "Leave Room" and "Just Leave Meeting".
2. Catch tab-close with `pagehide` and a keepalive request. Since `navigator.sendBeacon`
   can't attach an `Authorization` header, either (a) use `fetch(url, {keepalive:true})`
   with the header, or (b) rely on the webhook from 3a as the real guarantee and treat the
   client call as an optimization:
   ```ts
   useEffect(() => {
     const onHide = () => {
       fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/leave`, {
         method: 'POST', keepalive: true,
         headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken}` },
       }).catch(() => {});
     };
     window.addEventListener('pagehide', onHide);
     return () => window.removeEventListener('pagehide', onHide);
   }, [sessionId]);
   ```
   The webhook (3a) remains the source of truth; this just makes the roster update feel instant.

### 3c. Live roster / participant count (frontend)

Inside `<LiveKitRoom>`, use `useParticipants()` from `@livekit/components-react` to render
a roster: a header count ("3 in call"), a collapsible list of names, and lightweight
"X joined / X left" toasts on `ParticipantConnected` / `ParticipantDisconnected`. Filter
out `pose_worker_*` identities so bots don't show. This is the piece that makes it *feel*
like Meet.

## 4. Files to touch

- [ ] `apps/api/src/media/egress-webhook.controller.ts` (or new `livekit-webhook.controller.ts`) — handle `participant_left` / `room_finished`, verify signature (**required**)
- [ ] `apps/api/src/sessions/sessions.service.ts` — make `leave()` idempotent; add a "count real participants" / auto-end helper
- [ ] `apps/web/app/session/[id]/page.tsx` — call `/leave` on exit + `pagehide`; add roster UI
- [ ] LiveKit server config — ensure participant/room webhooks are enabled to the API

## 5. Verification

1. Coach + student in a session. Student clicks **Leave Room** → DB shows that
   participant's `leftAt` set; roster count drops for the coach in real time.
2. Student **force-closes the tab** (no clean leave) → within LiveKit's timeout the
   `participant_left` webhook fires and `leftAt` is set anyway.
3. **Everyone leaves** → the session auto-transitions to `ended` and egress stops
   (verify in logs / LiveKit dashboard). No infinite recording.
4. Roster shows accurate names/count and toasts on join/leave; `pose_worker_*` never
   appears.

## 6. Do NOT touch

- Don't rely on the client call alone — the webhook is the authoritative signal.
- Don't count `pose_worker_*` identities as real participants (they'd block auto-end).
- Keep `leave()` idempotent so double-fires (button + webhook) don't error.

## 7. Acceptance criteria

- `leftAt` is reliably set on both clean and unclean leaves.
- Abandoned sessions auto-end and stop recording.
- The room shows an accurate live roster and count.
