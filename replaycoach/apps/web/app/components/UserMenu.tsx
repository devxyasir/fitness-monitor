'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid, LogOut } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';
import { authClient } from '../../lib/auth-client';
import { Avatar } from './Avatar';

/** Shared account dropdown — used in the dashboard topbar and the landing
 * page header (an authenticated visitor stays on "/" now instead of being
 * force-redirected away; see AuthInitializer). `showDashboardLink` is off
 * inside the dashboard itself (already there) and on for the landing page. */
export function UserMenu({ showDashboardLink = false }: { showDashboardLink?: boolean }) {
  const { user } = useAuthStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const dashboardHref = user?.role === 'student' ? '/student/sessions' : '/coach/sessions';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="rounded-full hover:brightness-110 transition-all"
      >
        <Avatar user={user} size={32} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 bg-panel border border-hairline rounded-md shadow-lg overflow-hidden animate-rise z-20"
        >
          <div className="px-3.5 py-3 border-b border-hairline">
            <div className="text-sm font-semibold text-ink truncate">{user?.displayName ?? 'User'}</div>
            <div className="text-xs text-ink-faint truncate">{user?.email}</div>
          </div>
          {showDashboardLink && (
            <Link
              href={dashboardHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink hover:bg-panel-2 transition-colors"
            >
              <LayoutGrid className="w-4 h-4" />
              Dashboard
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await authClient.logout();
              router.push('/login');
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
