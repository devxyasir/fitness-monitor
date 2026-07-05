import { create } from 'zustand';
import type { UserDto } from '@replaycoach/types';

interface AuthState {
  accessToken: string | null;
  user: UserDto | null;
  setAuth: (accessToken: string, user: UserDto) => void;
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
  clearAuth: () => set({ accessToken: null, user: null }),
}));
