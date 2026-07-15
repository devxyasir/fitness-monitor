/**
 * theme-store — light/dark theme, persisted to localStorage. Light is the
 * product default (see app/layout.tsx's anti-FOUC script); dark is an
 * explicit opt-in via the toggle, never auto-applied from
 * prefers-color-scheme.
 */
import { create } from 'zustand';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'replaycoach-theme';

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset['theme'] = theme;
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  // The anti-flash inline script (see app/layout.tsx) already set
  // document.documentElement.dataset.theme before hydration — read that back
  // instead of defaulting here, or the store and DOM could disagree on
  // first toggle.
  theme: (typeof document !== 'undefined' && (document.documentElement.dataset['theme'] as Theme)) || 'light',

  setTheme: (theme) => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable (private browsing, etc.) — theme still
      // applies for this page load, just won't persist.
    }
    set({ theme });
  },

  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
}));
