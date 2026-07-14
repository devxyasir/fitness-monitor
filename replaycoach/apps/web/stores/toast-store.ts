/**
 * toast-store — global, app-wide toast notifications. Replaces blocking
 * alert() calls that were scattered across error-handling paths (clip
 * download failures, upload failures, etc.) with a non-blocking,
 * design-system-consistent notification.
 */
import { create } from 'zustand';

export type ToastVariant = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

const AUTO_DISMISS_MS = 5000;

interface ToastState {
  toasts: Toast[];
  push: (message: string, variant?: ToastVariant) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (message, variant = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
    return id;
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience helpers — `toast.error('X failed')` instead of the full store call. */
export const toast = {
  error: (message: string) => useToastStore.getState().push(message, 'error'),
  success: (message: string) => useToastStore.getState().push(message, 'success'),
  info: (message: string) => useToastStore.getState().push(message, 'info'),
};
