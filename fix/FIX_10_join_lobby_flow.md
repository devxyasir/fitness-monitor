# FIX 10 — Join & lobby flow gaps (waiting room, refresh, token retry)

**Priority:** Medium (functional + UX). Do after FIX_01 (auth) and FIX_02 (socket).
**Apps touched:** `apps/web` (primary), small `apps/api` read-access tweak

---

## 1. Symptoms

1. A student whose access is **pending** (lobby/approval mode) who opens the session room
   URL sees **"Connection Failed"** instead of a "waiting for the coach to admit you"
   screen.
2. If a pending student **refreshes** the lobby page, the app can 403 and break, because
   the session detail endpoint rejects non-approved users.
3. Joining can fail right after the 15-minute access token expires, because the join call
   doesn't auto-refresh the token like the rest of the app does.

## 2. Root cause (with evidence)

**1 — pending state renders as an error.** `apps/web/app/session/[id]/hooks/useLiveKitRoom.ts`
calls `getParticipantToken()` → `POST /sessions/:id/join`. For a pending student the API
(`sessions.controller.ts` `join()`) returns `{ token: null, status: 'pending' }`. The room
page (`session/[id]/page.tsx`) only checks `if (error || !token || !url)` and shows the
generic **Connection Failed** panel. It never inspects `status === 'pending'`, so the
lobby/waiting experience (which exists in `session/join/[id]/page.tsx`) is bypassed.

**2 — lobby refresh 403.** `SessionsGuard.canActivate` grants access only to the coach,
platform admin, or an **approved** participant (`isParticipant` requires
`status:'approved'`). A pending student calling `GET /sessions/:id` is denied. If the
lobby page fetches session detail on refresh, it 403s.

**3 — no token refresh on join.** `apps/web/lib/livekit-client.ts` → `getParticipantToken`
uses a **raw `fetch`** with the current access token and no 401-retry, unlike
`api-client.ts` (`fetchWithAuth`, which refreshes and retries). An expired token → join
fails outright.

## 3. The fix

### 3a. Route the pending student to a waiting screen (not an error)

`getParticipantToken` currently only returns `{token, url}`. Surface `status` too, and
have the room page branch on it.

- In `livekit-client.ts`, include `status` in `JoinSessionResponse` and return it.
- In `useLiveKitRoom.ts`, expose `status` alongside `token`/`url`.
- In `session/[id]/page.tsx`, before the `error || !token` check, add:
  ```ts
  if (status === 'pending') return <LobbyWaitingScreen sessionId={sessionId} />;
  if (status === 'rejected') return <RejectedScreen />;
  ```
  `LobbyWaitingScreen` shows "Waiting for the coach to let you in…" and listens on the
  socket for `lobby:approved` (the server already emits `emitLobbyApproved`) → on approval,
  re-run the join/token fetch and enter the room. Also handle `lobby:rejected`. You can
  reuse the waiting UI already in `session/join/[id]/page.tsx` — extract it into a shared
  component so both entry points use it.

### 3b. Let pending users read minimal session info

Two options — pick the smaller one that fits:
- Preferred: have the lobby/waiting screen rely on the **socket** approval event plus the
  `/join` response, and **not** call `GET /sessions/:id` at all while pending. Then the
  403 never happens. This is the least-privilege choice.
- If the lobby page genuinely needs session metadata (title, coach name), add a narrow
  public-ish endpoint (e.g. `GET /sessions/:id/summary`) that returns only non-sensitive
  fields and allows pending participants, instead of loosening the main `SessionsGuard`.

Do **not** broadly weaken `SessionsGuard` to let unapproved users read full session detail.

### 3c. Use the authenticated client for the join token

Change `getParticipantToken` to go through the shared `apiClient` (which handles the
401→refresh→retry path from FIX_01) instead of a raw `fetch`:

```ts
import { apiClient } from './api-client';

export async function getParticipantToken(sessionId: string): Promise<JoinSessionResponse> {
  return apiClient.post<Record<string, never>, JoinSessionResponse>(
    `/sessions/${sessionId}/join`,
    {},
  );
}
```
Keep the `JoinSessionResponse` type (add `status`). This removes the duplicated fetch/auth
logic and makes join resilient to token expiry.

## 4. Files to touch

- [ ] `apps/web/lib/livekit-client.ts` — return `status`; use `apiClient` (**required**)
- [ ] `apps/web/app/session/[id]/hooks/useLiveKitRoom.ts` — expose `status`
- [ ] `apps/web/app/session/[id]/page.tsx` — branch to lobby/rejected screens before the error panel
- [ ] Shared `LobbyWaitingScreen` component (extract from `session/join/[id]/page.tsx`)
- [ ] (Only if needed) `apps/api` — narrow `GET /sessions/:id/summary` for pending users

## 5. Verification

1. Set a session to lobby/approval mode. A student opens the room URL directly →
   sees a **waiting screen**, not "Connection Failed".
2. Coach approves from the lobby panel → the student's waiting screen automatically
   transitions into the live room (via `lobby:approved` socket).
3. Coach rejects → student sees a clear "request declined" screen.
4. Refreshing the waiting screen does not 403 / white-screen.
5. Let the access token expire, then join → it transparently refreshes and still connects.

## 6. Do NOT touch

- Don't weaken `SessionsGuard` to expose full session data to unapproved users.
- Don't auto-approve pending students; approval stays a coach action.

## 7. Acceptance criteria

- Pending/rejected students get proper lobby UX, never a generic connection error.
- Approval transitions the student into the room live.
- Join works even after token expiry; lobby refresh is stable.
