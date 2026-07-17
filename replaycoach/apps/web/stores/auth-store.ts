import { create } from 'zustand';
import type { UserDto } from '@replaycoach/types';

interface AuthState {
  accessToken: string | null;
  user: UserDto | null;
  setAuth: (accessToken: string, user: UserDto) => void;
  /** Patches the cached user object in place (e.g. after a profile edit) —
   * unlike setAuth, doesn't touch the token, since a display-name change
   * doesn't require a fresh JWT the way a role/org change does. */
  updateUser: (user: UserDto) => void;
  clearAuth: () => void;
}

/**
 * Zustand store for authentication state.
 *
 * Keeps accessToken in memory ONLY (never localStorage) to mitigate XSS risks
 * (06_Authentication_Authorization_RBAC.md §2).
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  updateUser: (user) => set({ user }),
  clearAuth: () => set({ accessToken: null, user: null }),
}));
