import { create } from 'zustand';

/**
 * Bridges "an admin API call hit ADMIN_ELEVATION_REQUIRED" (thrown deep in
 * some page's data-fetching code) to "show the step-up modal" (rendered
 * once, at the admin layout root) without threading a callback through
 * every admin page. Call `requestElevation()` from a catch block; the
 * promise resolves true once the admin re-enters their password, false if
 * they cancel — callers can retry their action on `true`.
 */
interface AdminElevateState {
  open: boolean;
  resolve: ((confirmed: boolean) => void) | null;
  requestElevation: () => Promise<boolean>;
  resolveOpen: (confirmed: boolean) => void;
}

export const useAdminElevateStore = create<AdminElevateState>((set, get) => ({
  open: false,
  resolve: null,
  requestElevation: () =>
    new Promise<boolean>((resolve) => {
      set({ open: true, resolve });
    }),
  resolveOpen: (confirmed) => {
    get().resolve?.(confirmed);
    set({ open: false, resolve: null });
  },
}));

/** Convenience: wraps an admin API call, catching ADMIN_ELEVATION_REQUIRED,
 * prompting for step-up, and retrying exactly once on success. */
export async function withAdminElevation<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const code = (err as { code?: string } | undefined)?.code;
    if (code !== 'ADMIN_ELEVATION_REQUIRED') throw err;
    const confirmed = await useAdminElevateStore.getState().requestElevation();
    if (!confirmed) throw err;
    return fn();
  }
}
