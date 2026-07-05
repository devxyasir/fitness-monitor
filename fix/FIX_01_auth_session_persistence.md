# FIX 01 — Auth: stop the frequent logouts (session persistence)

**Priority:** 1 (do this first — it unblocks all other testing)
**Apps touched:** `apps/web` (primary), `apps/api` (small, optional hardening)
**Estimated size:** small, high-leverage

---

## 1. Symptom (what the user sees)

Users are logged out constantly — on a browser refresh, sometimes seconds after
logging in, and often "for no reason." Closing and reopening the tab logs them out.
This makes the app impossible to test.

## 2. Root cause (with evidence)

The auth *design* is good: access token in memory (Zustand), refresh token in an
HttpOnly cookie, refresh-token **rotation with reuse detection** on the server. The
problem is a race that turns that good design against itself.

**Primary cause — concurrent refresh calls trip the reuse detector.**

- On app load, `apps/web/app/components/AuthInitializer.tsx` calls `authClient.refresh()`
  inside a `useEffect`. In React 18 **StrictMode** (dev), effects run **twice**, so two
  `refresh()` calls fire almost simultaneously.
- `apps/web/lib/auth-client.ts` → `refresh()` has **no de-duplication**. Both calls hit
  `POST /api/v1/auth/refresh` with the **same** refresh cookie.
- On the server, `apps/api/src/auth/auth.service.ts` → `refresh()` **rotates** the token:
  it deletes the old token and issues a new one (`refreshTokenService.rotate(...)`).
- The second concurrent request now presents a token that the first call **just
  deleted**. `refreshTokenService.findValid()` returns nothing, the server treats this
  as **token reuse**, and rejects with `401`.
- The client's `refresh()` calls `useAuthStore.getState().clearAuth()` on any non-OK
  response → **instant logout**.

The same thing happens when several tabs load at once, or when multiple `fetchWithAuth`
calls 401 at the same time and each independently calls `refresh()`.

**Secondary cause — a flaky profile fetch also logs you out.**

`refresh()` does **two** sequential network calls: `POST /auth/refresh`, then
`fetchUserProfile()` → `GET /api/v1/users/me`, each with a 5s timeout. If the *profile*
call fails (slow network, transient 500), `setAuth` is never called, the access token
stays `null`, and the user appears logged out even though the refresh itself succeeded.

**Tertiary cause — production cookie/domain mismatch.**

`apps/api/src/auth/cookie.helper.ts` sets the refresh cookie with `sameSite: 'strict'`.
On localhost this is fine (web `:3000` and API `:3001` are same-site). But if, in
production, the web app and API are served from **different registrable domains**,
`SameSite=Strict` means the browser will **not send** the refresh cookie on the
`/auth/refresh` request → refresh always fails → logout on every reload. Must be handled
before production.

## 3. The fix

### 3a. Add single-flight de-duplication to `refresh()` (the core fix)

Edit **`apps/web/lib/auth-client.ts`**. Wrap `refresh()` so that concurrent callers share
one in-flight promise. This guarantees only **one** `/auth/refresh` request (and thus one
rotation) happens at a time, which eliminates the reuse-detection logout.

Replace the existing `refresh` function with this pair (`refresh` + `doRefresh`):

```ts
// Module-level: holds the in-flight refresh so concurrent callers share it.
let refreshInFlight: Promise<UserDto> | null = null;

/**
 * Refresh the session. Single-flight: if a refresh is already running,
 * return the same promise instead of starting a second one. This prevents
 * two concurrent /auth/refresh calls from rotating the refresh token twice,
 * which the server would flag as token reuse and force a logout.
 */
async function refresh(): Promise<UserDto> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<UserDto> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    timeout: 5000,
  });

  if (!res.ok) {
    // Genuine "no valid session" — clear and bubble up.
    useAuthStore.getState().clearAuth();
    throw new Error('Session expired');
  }

  const { accessToken } = (await res.json()) as TokenResponse;

  // Fetch profile. IMPORTANT: a failure HERE must NOT clear auth — the refresh
  // itself succeeded and the access token is valid. Set the token first so the
  // session survives even if /users/me is briefly unavailable.
  try {
    const user = await fetchUserProfile(accessToken);
    useAuthStore.getState().setAuth(accessToken, user);
    return user;
  } catch (profileErr) {
    // Keep the session alive with the token we have; surface a soft error.
    const existingUser = useAuthStore.getState().user;
    if (existingUser) {
      useAuthStore.getState().setAuth(accessToken, existingUser);
      return existingUser;
    }
    throw profileErr;
  }
}
```

Leave `login`, `register`, and `logout` as they are. Keep the `authClient` export
unchanged (`export const authClient = { login, register, refresh, logout };`).

### 3b. Make the 401-retry reuse the single-flight refresh

Open **`apps/web/lib/api-client.ts`** → `fetchWithAuth`. It already calls
`authClient.refresh()` on 401, which now automatically shares the in-flight promise — so
**no change needed** beyond confirming it calls `authClient.refresh()` (it does). Just
verify that when refresh throws, the original 401 response is returned (it is) so callers
get a clean error rather than a hang.

### 3c. Make the prod cookie strategy configurable (do not hardcode Strict)

Edit **`apps/api/src/auth/cookie.helper.ts`**. Drive `sameSite` and an optional `domain`
from config instead of hardcoding `'strict'`, so cross-domain production deployments work.

```ts
export function setRefreshCookie(
  res: Response,
  token: string,
  configService: ConfigService,
): void {
  const env = configService.get<string>('app.env');
  const isProduction = env !== 'development' && env !== 'test';

  // 'strict' is correct when web + API share a registrable domain.
  // Use 'none' (requires Secure) only when they are on different domains.
  const sameSite =
    (configService.get<string>('auth.cookieSameSite') as 'strict' | 'lax' | 'none') ??
    'strict';
  const domain = configService.get<string>('auth.cookieDomain') || undefined;

  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction || sameSite === 'none', // SameSite=None requires Secure
    sameSite,
    path: COOKIE_PATH,
    domain,
    maxAge,
  });
}
```

Add matching optional config keys (`AUTH_COOKIE_SAMESITE`, `AUTH_COOKIE_DOMAIN`) in
`apps/api/src/config/configuration.ts` and `config.schema.ts` (default `sameSite` to
`'strict'`, `domain` empty). For **local dev, leave the defaults** — this only matters in
production. Document in `apps/api/.env.example` (do NOT put real values in `.env.example`).

### 3d. (Optional, recommended) Multi-tab / reload grace on the server

Single-flight fixes the dominant case (StrictMode + concurrent 401s in one tab). Two
**separate tabs** loading at once still each fire one refresh with the same cookie, and
the second can still trip reuse detection. If the user reports multi-tab logouts, add a
short **reuse grace window** on the server: in `refresh-token.service.ts`, when a rotated
token is presented again within, say, 10 seconds, return the already-rotated successor
instead of revoking the family. Keep the hard reuse-revocation for anything older than
the grace window (that's the real security case). Treat this as a follow-up, not part of
the core fix — call it out to the user and wait for confirmation before implementing,
since it changes security-sensitive logic.

## 4. Files to touch

- [ ] `apps/web/lib/auth-client.ts` — single-flight `refresh()` + non-fatal profile fetch (**required**)
- [ ] `apps/web/lib/api-client.ts` — verify only (no change expected)
- [ ] `apps/api/src/auth/cookie.helper.ts` — config-driven `sameSite`/`domain` (**required for prod**)
- [ ] `apps/api/src/config/configuration.ts` + `config.schema.ts` — new optional keys
- [ ] `apps/api/.env.example` — document the new keys (no secrets)

## 5. Verification

**Automated:**
```bash
pnpm --filter @replaycoach/api test      # auth + refresh-token specs must still pass
pnpm --filter @replaycoach/api typecheck
pnpm --filter @replaycoach/web typecheck
```

**Manual (this is the real test):**
1. Start API + web. Log in as any user.
2. **Hard refresh the browser 10 times in a row.** You must stay logged in every time.
   (Before this fix, StrictMode double-refresh logs you out on the first reload.)
3. Open DevTools → Network. On reload you should see **exactly one** `POST /auth/refresh`
   (not two), returning `200`, followed by one `GET /users/me`.
4. Leave the tab open past the 15-minute access-token expiry, then trigger any API call
   (navigate a dashboard). It should transparently refresh and succeed — no logout.
5. Kill the API's `/users/me` route temporarily (or throttle it) and reload — you should
   **remain logged in** (session survives a flaky profile fetch).

**Server logs to watch:** you should NOT see repeated "Invalid or expired refresh token"
or family-revocation warnings on a normal reload.

## 6. Do NOT touch

- Do not move the access token into `localStorage`/`sessionStorage` (that reintroduces an
  XSS token-theft vector — the in-memory + HttpOnly-cookie split is correct).
- Do not remove refresh-token rotation or reuse detection — only prevent the client from
  triggering it accidentally.
- Do not change argon2 hashing, the constant-time dummy verify, or the JWT payload shape.
- Do not implement `apps/web/middleware.ts` route-guarding as part of this brief (it's a
  no-op placeholder today; server-side guards are the real boundary). Leave it for later.

## 7. Acceptance criteria

- Reloading the app 10× in a row never logs the user out.
- Exactly one `/auth/refresh` request per reload.
- A transient `/users/me` failure does not log the user out.
- `sameSite`/`domain` are configurable; local defaults unchanged; all auth tests green.
