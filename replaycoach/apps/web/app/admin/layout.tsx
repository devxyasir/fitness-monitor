'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  Video,
  Film,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  LogOut,
  ArrowLeftToLine,
  Clock,
  Globe,
  Server,
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';
import { authClient } from '../../lib/auth-client';
import { Avatar } from '../components/Avatar';
import { Logomark } from '../components/Logomark';
import { AdminAuthGuard } from './AdminAuthGuard';
import { AdminElevateModal } from './AdminElevateModal';
import { NotificationBell } from './NotificationBell';

const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard; exact: boolean }[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users, exact: false },
  { href: '/admin/organizations', label: 'Organizations', icon: Building2, exact: false },
  { href: '/admin/sessions', label: 'Sessions', icon: Video, exact: false },
  { href: '/admin/clips', label: 'Clips', icon: Film, exact: false },
  { href: '/admin/geo-logs', label: 'Geo logs', icon: Globe, exact: false },
  { href: '/admin/status', label: 'Status', icon: Server, exact: false },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText, exact: false },
  { href: '/admin/security', label: 'Security', icon: ShieldCheck, exact: false },
  { href: '/admin/settings', label: 'Settings', icon: SlidersHorizontal, exact: false },
];

const ELEVATION_DISPLAY_TTL_MS = 30 * 60 * 1000; // matches the server default (ADMIN_ELEVATION_TTL)

/**
 * A deliberately distinct shell from (dashboard)/layout.tsx — darker/denser
 * chrome (bg-canvas rather than bg-panel), the `analytics` accent
 * throughout (matching the pre-existing design convention for admin/stats
 * surfaces), and a real client-side auth guard rather than a hidden nav
 * link. This is the /admin/login page's sibling, not its child — the
 * login page renders its own full-screen layout outside this shell.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/admin/login') return <>{children}</>;

  return (
    <AdminAuthGuard>
      <AdminShell>{children}</AdminShell>
      <AdminElevateModal />
    </AdminAuthGuard>
  );
}

function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [remainingLabel, setRemainingLabel] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const elevatedAt = authClient.getAdminAuthAt();
      if (!elevatedAt) {
        setRemainingLabel(null);
        return;
      }
      const remainingMs = elevatedAt + ELEVATION_DISPLAY_TTL_MS - Date.now();
      if (remainingMs <= 0) {
        setRemainingLabel('expired');
        return;
      }
      setRemainingLabel(`${Math.ceil(remainingMs / 60000)}m`);
    };
    tick();
    const interval = setInterval(tick, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    // A plain router.push here left a real bug: if the network call inside
    // authClient.logout() throws (timeout, transient failure), the store
    // never gets cleared and the push after it never runs — the admin
    // stayed on the same page, now silently failing every API call with no
    // token, looking like "the dashboard with no data." A full browser
    // navigation sidesteps that class of problem entirely: it throws away
    // the whole JS heap (Zustand store, router cache, component tree) and
    // starts clean, so there's nothing stale left to show regardless of
    // whether the logout call itself succeeded. try/catch guarantees the
    // navigation fires either way — a failed server-side revoke shouldn't
    // trap the admin in a logged-in-looking shell they can't leave.
    try {
      await authClient.logout();
    } catch (err) {
      console.error('[AdminShell] Logout request failed, navigating away anyway:', err);
    } finally {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink flex">
      <aside className="hidden lg:flex w-[240px] flex-shrink-0 bg-panel border-r border-hairline flex-col py-5 px-3.5 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2 mb-1">
          <Logomark className="w-5 h-5 text-analytics" />
          <span className="font-display text-display-s">LetsMove</span>
        </div>
        <div className="px-2 mb-6">
          <span className="font-mono text-[0.6875rem] text-analytics uppercase tracking-widest">Platform Admin</span>
        </div>

        <nav className="flex flex-col gap-0.5 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm border-l-[3px] transition-colors ${
                  active
                    ? 'bg-panel-2 text-ink font-medium border-analytics pl-[10px]'
                    : 'text-ink-muted hover:bg-panel-2 hover:text-ink border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/coach"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm text-ink-muted hover:bg-panel-2 hover:text-ink transition-colors mb-2"
        >
          <ArrowLeftToLine className="w-4 h-4 flex-shrink-0" />
          Exit admin
        </Link>

        <div className="flex items-center gap-2.5 p-2.5 rounded-md border border-hairline">
          <Avatar user={user} size={28} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink truncate">{user?.displayName}</div>
            <div className="text-xs text-ink-faint truncate">{user?.email}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            className="text-ink-faint hover:text-danger transition-colors flex-shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-panel/85 backdrop-blur-md border-b border-hairline">
          <div className="flex items-center justify-between px-4 sm:px-7 py-3.5">
            <div className="lg:hidden flex items-center gap-2">
              <Logomark className="w-5 h-5 text-analytics" />
              <span className="font-display text-display-s">Admin</span>
            </div>
            <div className="hidden lg:block" />
            <div className="flex items-center gap-4">
              {remainingLabel && (
                <div
                  className="flex items-center gap-1.5 font-mono text-xs text-ink-faint"
                  title="Time before the admin area asks you to re-enter your password"
                >
                  <Clock className="w-3.5 h-3.5" />
                  {remainingLabel === 'expired' ? 'Re-verify on next action' : `Elevated · ${remainingLabel}`}
                </div>
              )}
              <NotificationBell />
            </div>
          </div>
        </header>
        <main className="p-4 sm:p-7 max-w-7xl">{children}</main>
      </div>
    </div>
  );
}
