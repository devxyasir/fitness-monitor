import { useAuthStore } from '../stores/auth-store';
import type { AdminElevateRequest, LoginRequest, RegisterRequest, TokenResponse, UserDto } from '@replaycoach/types';

const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

/** localStorage key used to broadcast logout to other tabs (see bottom of file). */
const LOGOUT_BROADCAST_KEY = 'rc_logout_broadcast';

// ─── Silent (proactive) token refresh ───────────────────────────────────────
// Reactive refresh (on mount / on 401) already exists below; this adds a
// timer so the access token is renewed shortly before it actually expires,
// instead of waiting for a request to fail first.

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const REFRESH_BUFFER_MS = 60_000; // refresh this long before the token's real expiry
const MIN_REFRESH_DELAY_MS = 5_000; // never schedule tighter than this (clock skew safety)

/** Reads the `exp` claim out of a JWT without verifying it — verification is
 * the server's job; this is only used to time a local timer. */
function decodeJwtExpMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Reads the `adminAuthAt` claim (epoch ms) out of the current access
 * token, unverified — same "decode, don't verify, it's the server's job"
 * pattern as decodeJwtExpMs. Used by the admin shell's elevation countdown
 * and by AdminAuthGuard's initial (pre-first-API-call) freshness check. */
function getAdminAuthAt(): number | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { adminAuthAt?: number };
    return typeof json.adminAuthAt === 'number' ? json.adminAuthAt : null;
  } catch {
    return null;
  }
}

function scheduleSilentRefresh(accessToken: string): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const expMs = decodeJwtExpMs(accessToken);
  if (expMs === null) return;
  const delay = Math.max(MIN_REFRESH_DELAY_MS, expMs - Date.now() - REFRESH_BUFFER_MS);
  refreshTimer = setTimeout(() => {
    refresh().catch((err) => console.warn('Silent refresh failed:', err));
  }, delay);
}

function clearSilentRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/** Helper to construct authorization headers using the store's current token */
function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Helper to fetch with an absolute timeout limit. Default raised from 5s to
 * 15s — 5s was tripping during real (if brief) server load spikes (e.g. a
 * CPU-heavy reference-video analysis job running on this shared box), which
 * surfaced as a raw "signal is aborted without reason" DOMException message
 * straight in the login form instead of a real error.
 */
async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number }): Promise<Response> {
  const { timeout = 15000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('The server is taking longer than usual to respond. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Fetch authenticated user profile using the provided access token.
 */
async function fetchUserProfile(accessToken: string): Promise<UserDto> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/users/me`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    timeout: 15000,
  });
  if (!res.ok) throw new Error('Failed to retrieve user profile');
  return res.json() as Promise<UserDto>;
}

/**
 * Login: POST credentials, receive access token, fetch profile, update store.
 */
async function login(payload: LoginRequest): Promise<UserDto> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include', // essential to receive httpOnly cookies
    timeout: 15000,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Login failed' })) as { message?: string };
    throw new Error(errorData.message ?? 'Login failed');
  }

  const { accessToken } = (await res.json()) as TokenResponse;
  const user = await fetchUserProfile(accessToken);
  useAuthStore.getState().setAuth(accessToken, user);
  scheduleSilentRefresh(accessToken);

  // An admin login overwrites the shared httpOnly refresh cookie with the
  // admin's own — any OTHER already-open tab still showing a coach/student
  // session (its own in-memory accessToken, unaffected by this) is now
  // sitting on stale state: its refresh cookie no longer belongs to it.
  // Broadcasting here (the same signal explicit logout already uses) makes
  // that tab clear its stale auth immediately instead of continuing to look
  // signed-in until it happens to hit a 401 on its own. Scoped to admin
  // logins only — a regular coach/student login doesn't need this, since
  // nothing about a normal login orphans another tab's session the way
  // overwriting the shared admin-scoped cookie does.
  if (payload.context === 'admin') {
    broadcastLogout();
  }

  return user;
}

/**
 * Register: POST signup details, fetch profile, update store.
 */
async function register(payload: RegisterRequest): Promise<UserDto> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
    timeout: 15000,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Registration failed' })) as { message?: string };
    throw new Error(errorData.message ?? 'Registration failed');
  }

  const { accessToken } = (await res.json()) as TokenResponse;
  const user = await fetchUserProfile(accessToken);
  useAuthStore.getState().setAuth(accessToken, user);
  scheduleSilentRefresh(accessToken);
  return user;
}

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

/**
 * Refresh: POST to refresh endpoint (httpOnly cookies passed automatically).
 * Returns the new user details and updates the store with the new access token.
 */
async function doRefresh(): Promise<UserDto> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    timeout: 15000,
  });

  if (!res.ok) {
    // Genuine "no valid session" — clear and bubble up.
    useAuthStore.getState().clearAuth();
    clearSilentRefresh();
    throw new Error('Session expired');
  }

  const { accessToken } = (await res.json()) as TokenResponse;
  scheduleSilentRefresh(accessToken);

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

/**
 * Logout: call revoke on backend, clear store, and tell other open tabs.
 */
async function logout(): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    timeout: 15000,
  });

  useAuthStore.getState().clearAuth();
  clearSilentRefresh();
  broadcastLogout();
  if (!res.ok) {
    // Audit log / warning, but clean up state anyway.
    console.warn('Logout request did not complete successfully on backend');
  }
}

/**
 * Step-up re-verification for the admin area (POST /auth/admin/elevate) —
 * re-checks the password and swaps in a freshly-elevated access token
 * without touching the refresh-token session (unlike login/refresh, this
 * never rotates the refresh cookie). Used by AdminElevateModal when an API
 * call comes back with the ADMIN_ELEVATION_REQUIRED code.
 */
async function elevateAdmin(payload: AdminElevateRequest): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/admin/elevate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
    credentials: 'include',
    timeout: 15000,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Incorrect password' })) as { message?: string };
    throw new Error(errorData.message ?? 'Incorrect password');
  }

  const { accessToken } = (await res.json()) as TokenResponse;
  const existingUser = useAuthStore.getState().user;
  if (existingUser) {
    useAuthStore.getState().setAuth(accessToken, existingUser);
  }
  scheduleSilentRefresh(accessToken);
}

// ─── Cross-tab logout sync ───────────────────────────────────────────────
// Each tab has its own in-memory access token (deliberately — see auth-store.ts),
// so a tab that logs out doesn't automatically tell any other open tab. Since
// the refresh cookie is shared across tabs and gets revoked/cleared on logout,
// other tabs would eventually discover this on their own next refresh/401 —
// but broadcasting via localStorage's 'storage' event makes it instant instead
// of leaving stale tabs looking signed-in until their next API call.

function broadcastLogout(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOGOUT_BROADCAST_KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private browsing, quota) — other tabs just fall
    // back to discovering the logout on their own next 401.
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== LOGOUT_BROADCAST_KEY || event.newValue === null) return;
    useAuthStore.getState().clearAuth();
    clearSilentRefresh();
  });
}

export const authClient = { login, register, refresh, logout, elevateAdmin, getAdminAuthAt };
