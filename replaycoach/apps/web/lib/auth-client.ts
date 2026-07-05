import { useAuthStore } from '../stores/auth-store';
import type { LoginRequest, RegisterRequest, TokenResponse, UserDto } from '@replaycoach/types';

const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

/** Helper to construct authorization headers using the store's current token */
function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** Helper to fetch with an absolute timeout limit */
async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number }): Promise<Response> {
  const { timeout = 5000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
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
    timeout: 5000,
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
    timeout: 5000,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Login failed' })) as { message?: string };
    throw new Error(errorData.message ?? 'Login failed');
  }

  const { accessToken } = (await res.json()) as TokenResponse;
  const user = await fetchUserProfile(accessToken);
  useAuthStore.getState().setAuth(accessToken, user);
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
    timeout: 5000,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Registration failed' })) as { message?: string };
    throw new Error(errorData.message ?? 'Registration failed');
  }

  const { accessToken } = (await res.json()) as TokenResponse;
  const user = await fetchUserProfile(accessToken);
  useAuthStore.getState().setAuth(accessToken, user);
  return user;
}

/**
 * Refresh: POST to refresh endpoint (httpOnly cookies passed automatically).
 * Returns the new user details and updates the store with the new access token.
 */
async function refresh(): Promise<UserDto> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    timeout: 5000,
  });

  if (!res.ok) {
    useAuthStore.getState().clearAuth();
    throw new Error('Session expired');
  }

  const { accessToken } = (await res.json()) as TokenResponse;
  const user = await fetchUserProfile(accessToken);
  useAuthStore.getState().setAuth(accessToken, user);
  return user;
}

/**
 * Logout: call revoke on backend, clear store.
 */
async function logout(): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    timeout: 5000,
  });

  useAuthStore.getState().clearAuth();
  if (!res.ok) {
    // Audit log / warning, but clean up state anyway.
    console.warn('Logout request did not complete successfully on backend');
  }
}

export const authClient = { login, register, refresh, logout };
