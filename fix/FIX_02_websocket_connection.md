# FIX 02 — WebSocket: "failed to connect" (realtime gateway)

**Priority:** 2 (do after FIX_01 — it depends on a valid access token)
**Apps touched:** `apps/web` (primary), `apps/api` (gateway CORS + adapter hardening)
**Depends on:** FIX_01 (the socket connects with the access token; if auth is racy the
socket is dropped as unauthenticated).

---

## 1. Symptom

The browser console shows `[Socket.IO] Connect error:` / "failed to connect", and the
socket never stays connected. Because everything realtime rides on this socket — the live
pose/skeleton overlay (`pose:update`), replay sync (`replay:*`), and annotations
(`annotation:*`) — none of those features work until the socket connects reliably.

## 2. Root cause (with evidence)

Three independent problems, in rough order of impact.

**A. The socket connects with a `null` / stale token → server drops it.**

- The client connects only when `connectSocket(token)` is called. Call sites:
  `apps/web/app/session/[id]/hooks/useReplaySocket.ts:20`,
  `apps/web/app/session/[id]/hooks/useAnnotationSocket.ts:18`,
  `apps/web/app/session/join/[id]/page.tsx:74` — each passes `accessToken` from the store.
- During the auth-restore race (see FIX_01), `accessToken` is often `null` for the first
  moment after load. `connectSocket(null)` sets `socket.auth = { token: null }` and connects.
- Server side, `apps/api/src/realtime/realtime.gateway.ts` → `handleConnection()` reads
  `client.handshake.auth.token`; if it's missing or not a string, it **immediately
  `client.disconnect()`s**. Result: `connect_error` / instant disconnect = "failed to
  connect."
- Fixing FIX_01 reduces this, but the socket layer must **refuse to connect without a
  real token** and **reconnect once the token arrives**.

**B. WebSocket-only transport with no fallback.**

`apps/web/lib/socket-client.ts` forces `transports: ['websocket']`. This removes
Socket.IO's normal polling→upgrade handshake. If the initial WebSocket upgrade hiccups
(proxy, dev server timing, HMR reconnect), there is **no polling fallback** to recover,
so the connection just fails instead of degrading gracefully.

**C. A broken "already connecting" guard causes duplicate/blocked attempts.**

In `connectSocket()`, the guard checks `(socket as any).connecting` — the Socket.IO
client has **no** `connecting` property (it's always `undefined`), so this guard never
does what it intends. Combined with the token-change path, this can double-fire connects
or skip a needed reconnect. Use `socket.active` instead.

**Minor:** the gateway declares `cors: { origin: '*' }`. It works today because the socket
sends no cookies, but it should be an explicit allow-list aligned with `CORS_ORIGIN` for
production hygiene.

## 3. The fix

### 3a. Client: don't connect without a token, add polling fallback, fix the guard

Rewrite the relevant parts of **`apps/web/lib/socket-client.ts`**:

```ts
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export function getSocketUrl(): string {
  return SOCKET_URL;
}

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  // Allow polling as a fallback; Socket.IO upgrades to websocket when possible.
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
});

socket.on('connect', () => {
  console.log('[Socket.IO] Connected:', socket.id);
});
socket.on('disconnect', (reason) => {
  console.warn('[Socket.IO] Disconnected:', reason);
});
socket.on('connect_error', (error) => {
  console.error('[Socket.IO] Connect error:', error.message || error);
});

/**
 * Connect (or reconnect) with the current access token.
 * Refuses to connect without a token — an unauthenticated socket is dropped
 * by the server immediately, which surfaces as "failed to connect".
 */
export function connectSocket(token: string | null | undefined): void {
  if (!token) {
    // No valid token yet — do not attempt. Caller should retry once auth is ready.
    return;
  }

  const currentToken = (socket.auth as { token?: string } | undefined)?.token;

  // Already connected/connecting with the same token → nothing to do.
  if (currentToken === token && socket.active) return;

  socket.auth = { token };

  // If a socket is live under an old token, restart it so the new token is used
  // in the handshake.
  if (socket.active) {
    socket.disconnect();
  }
  socket.connect();
}

export function disconnectSocket(): void {
  if (socket.active) socket.disconnect();
}
```

Notes:
- `socket.active` is the correct "is this socket connected or trying to connect?" flag.
- Passing `null`/`undefined` is now a safe no-op, so the auth race can't produce a
  dropped unauthenticated socket.

### 3b. Client: (re)connect once the token becomes available

Ensure the socket is (re)connected when `accessToken` transitions from `null` to a real
value. In each hook that connects (`useReplaySocket.ts`, `useAnnotationSocket.ts`) and in
`session/join/[id]/page.tsx`, the `connectSocket(accessToken)` call should live in a
`useEffect` that has **`accessToken` in its dependency array**, so it re-runs when the
token arrives after refresh. Verify this is the case; if any call runs only once on mount
with a possibly-null token, move it into a token-dependent effect, e.g.:

```ts
useEffect(() => {
  if (!accessToken) return;
  connectSocket(accessToken);
}, [accessToken]);
```

Also re-authenticate on reconnect: if the server ever drops the socket for an
auth reason, refresh the token and reconnect. Add (once, e.g. in a top-level session
hook):

```ts
useEffect(() => {
  const onErr = async (err: Error) => {
    if （/unauthor/i.test(err.message)) {
      try {
        await authClient.refresh();
        connectSocket(useAuthStore.getState().accessToken);
      } catch { /* refresh failed → AuthInitializer will route to /login */ }
    }
  };
  socket.on('connect_error', onErr);
  return () => { socket.off('connect_error', onErr); };
}, []);
```
> Replace the full-width parenthesis `（` above with a normal `(` — shown here only to
> avoid a copy-paste hazard; use standard ASCII parentheses in code.

### 3c. Server: explicit CORS on the gateway

In **`apps/api/src/realtime/realtime.gateway.ts`**, replace `cors: { origin: '*' }` with an
explicit allow-list from the same env var the HTTP CORS uses:

```ts
@WebSocketGateway({
  cors: {
    origin: (process.env['CORS_ORIGIN']?.split(',')) ?? [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
    ],
    credentials: true,
  },
})
```

### 3d. Server: make sure the Redis adapter can't break connections

`apps/api/src/realtime/redis-io.adapter.ts` already falls back to the in-memory adapter if
Redis is unavailable, and `connectToRedis()` swallows its own errors — good. Confirm two
things so a Redis hiccup never takes the socket server down:
- `createIOServer` still returns a working server when `adapterConstructor` is undefined
  (it does — it just logs a warning). Leave that behavior.
- `main.ts` awaits `connectToRedis()` **before** `useWebSocketAdapter`; since the method
  never throws, bootstrap always completes. Do not add an `await` that can reject here.

No code change is expected in 3d unless verification shows the server failing to boot when
Redis is down — in which case wrap the Redis connect in an outer try/catch in `main.ts`.

## 4. Files to touch

- [ ] `apps/web/lib/socket-client.ts` — token-gated connect, polling fallback, `socket.active` guard (**required**)
- [ ] `apps/web/app/session/[id]/hooks/useReplaySocket.ts` — connect in a token-dependent effect (verify/adjust)
- [ ] `apps/web/app/session/[id]/hooks/useAnnotationSocket.ts` — same (verify/adjust)
- [ ] `apps/web/app/session/join/[id]/page.tsx` — same (verify/adjust)
- [ ] `apps/api/src/realtime/realtime.gateway.ts` — explicit CORS allow-list (**required**)
- [ ] `apps/api/src/realtime/redis-io.adapter.ts` / `main.ts` — verify only (change only if boot fails with Redis down)

## 5. Verification

**Prereq:** FIX_01 is done and you can stay logged in.

1. Start API + web, log in, and open a session room.
2. DevTools → Network → WS. You should see a socket connection that **stays open**
   (status 101, green), not a rapid connect→disconnect loop.
3. Console shows `[Socket.IO] Connected: <id>` and **no** repeating `Connect error`.
4. API logs show `Socket client <id> authenticated as <email>` and then
   `... joined main room: [session:<id>]` — not `Disconnecting unauthenticated socket`.
5. **Auth-race test:** hard-refresh the session page repeatedly. The socket should
   reconnect cleanly every time (it now waits for the token instead of connecting with
   `null`).
6. **Redis-down test (optional):** stop Redis, restart the API. It should still boot and
   sockets should still connect (in-memory adapter fallback), with a warning in logs.
7. Emit a test event end-to-end: trigger an annotation as the coach and confirm the
   student's socket receives `annotation:draw` (proves the room join + emit path works).

## 6. Do NOT touch

- Do not remove server-side socket JWT verification in `handleConnection` — keep
  unauthenticated sockets rejected. The fix is to stop the *client* from connecting
  without a token, not to loosen the server.
- Do not switch the gateway to a custom `path` or `namespace` unless you also update the
  client — the defaults currently line up.
- Do not disable the Redis adapter; it's needed for multi-instance scaling (FIX_07).

## 7. Acceptance criteria

- The session socket connects and **stays connected** through reloads.
- No `Connect error` spam; server logs show authenticated joins, not unauthenticated
  disconnects.
- A coach action (annotation) is received by a student in real time over the socket.
- The API still boots with Redis unavailable (in-memory fallback).
