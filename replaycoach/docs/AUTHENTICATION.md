# Authentication & Session Management

Status of the auth system as of the Phase 1 hardening pass. Scope: `apps/api/src/auth/*`, `apps/web/middleware.ts`, `apps/web/lib/auth-client.ts`, `apps/web/stores/auth-store.ts`.

## Model

Split-token design:

| Token | Where it lives | Lifetime | Purpose |
|---|---|---|---|
| Access token (JWT) | Zustand store, **in memory only** (never localStorage) | 15 min (`JWT_EXPIRY`) | Sent as `Authorization: Bearer <token>` on every API call |
| Refresh token (opaque UUID) | httpOnly cookie `rc_refresh`, `Path=/api/v1/auth` | 1 day session / 7 day "remember me" | Exchanged for a new access token at `POST /auth/refresh` |
| Session hint | non-httpOnly cookie `rc_has_session`, `Path=/` | mirrors the refresh cookie | Lets `apps/web/middleware.ts` tell signed-in from signed-out without ever seeing a real token |

The access token is never persisted client-side, so a hard reload always starts with an empty in-memory token; `AuthInitializer` calls `POST /auth/refresh` on mount to restore the session from the refresh cookie (skipped entirely if `rc_has_session` isn't present, to avoid a guaranteed-401 round trip for anonymous visitors).

Refresh tokens are stored server-side as argon2id hashes (`refresh_tokens` table), never as raw values, with a fast SHA-256 lookup index. See inline docs in `apps/api/src/auth/refresh-token.service.ts` for the rotation/reuse-detection design (family grouping, 10s grace window for concurrent/multi-tab refresh, theft detection on out-of-window reuse).

## "Remember me"

`LoginDto.rememberMe` (optional, default `false`) controls both:
- The refresh token's TTL: `JWT_SESSION_EXPIRY` (default `1d`) vs `JWT_REFRESH_EXPIRY` (default `7d`).
- The refresh cookie's persistence: a session cookie (cleared on browser close, no `maxAge`) vs a persistent cookie (`maxAge` set to match the DB row's `expiresAt`).

The choice is stored on the `refresh_tokens` row itself (`remember_me` column, migration `015`) and carried forward by `RefreshTokenService.rotate()` on every subsequent refresh — a client can't silently upgrade a session-only login into a persistent one by omitting the field on a later request.

Registration always issues a "remember me" session (no checkbox on the signup form).

## Logout

`POST /auth/logout`:
1. Bumps `User.sessionVersion` — `JwtStrategy.validate()` rejects any access token whose `sessionVersion` claim doesn't match the current DB value, so this invalidates **every** still-live access token for that user immediately, not just the one used to call logout.
2. Revokes the specific refresh token row.
3. Clears both cookies.

Other open tabs are notified via a `localStorage` broadcast (`rc_logout_broadcast`) so they clear their in-memory session immediately instead of waiting for their next 401.

## Silent refresh

`apps/web/lib/auth-client.ts` refreshes the access token two ways:
- **Reactive**: any API call that comes back `401` triggers one refresh + retry (`api-client.ts`).
- **Proactive**: after every successful login/register/refresh, a timer is scheduled ~60s before the access token's `exp` claim, so it's renewed before it actually expires under normal use.

Both paths go through a single-flight guard (`refreshInFlight`) so concurrent triggers don't double-rotate the refresh token (which the server would otherwise treat as reuse).

## Route protection

`apps/web/middleware.ts` redirects to `/login` when the `rc_has_session` hint cookie is absent, for the route prefixes in its `matcher` (`/coach`, `/student`, `/dashboard`, `/session`, `/admin`). **This is a UX convenience only** — it can't inspect the real (httpOnly) refresh token or the (in-memory) access token, so a forged/stale hint cookie can only route a visitor to the wrong page. Every API endpoint independently re-validates the access token (`JwtAuthGuard`) and re-checks role/ownership (`RolesGuard`, `SessionsGuard`) on every request regardless of what the middleware decided.

## RBAC

`@Roles(...)` + `RolesGuard` read `request.user.role` (the JWT payload's `role` claim — not a fresh DB read, so a role change takes effect on that user's next token refresh, not instantly). Applied per-controller via `@UseGuards(JwtAuthGuard, RolesGuard)`, not globally — each controller must include both guards explicitly. `UserRole` = `'platform_admin' | 'studio_admin' | 'coach' | 'student'` (`packages/types/src/auth.ts`); self-registration is restricted to `'coach' | 'student'`.

## Known remaining gaps (not addressed in this phase)

- RBAC guard application is manual per-controller rather than a global `APP_GUARD` — coverage depends on each controller author remembering to add it.
- Password reset (`/auth/password/reset`) is still a stub — no email infrastructure exists yet.
- `JWT_REFRESH_SECRET` is required by config validation but unused (refresh tokens are opaque UUIDs, not JWTs, so nothing signs/verifies against it).
