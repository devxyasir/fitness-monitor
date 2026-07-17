'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { LayoutGrid, CalendarDays, Film, Users, Settings, Menu, X, LogOut, Building2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';
import { authClient } from '../../lib/auth-client';
import { ThemeToggle } from '../components/ThemeToggle';
import { Logomark } from '../components/Logomark';
import { Button } from '../components/ui/Button';

function UserMenu({ role }: { role: 'coach' | 'student' }) {
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

  const initial = user?.displayName?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? 'U';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="w-8 h-8 rounded-full bg-analytics flex items-center justify-center text-[0.6875rem] font-bold text-white dark:text-canvas hover:brightness-110 transition-all"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 bg-panel border border-hairline rounded-md shadow-lg overflow-hidden animate-rise z-20"
        >
          <div className="px-3.5 py-3 border-b border-hairline">
            <div className="text-sm font-semibold text-ink truncate">{user?.displayName ?? 'User'}</div>
            <div className="text-xs text-ink-faint truncate">{user?.email ?? role}</div>
          </div>
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

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  roles: ('coach' | 'student')[];
}

const navItems: NavItem[] = [
  { href: '/coach', label: 'Overview', icon: <LayoutGrid className="w-4 h-4" />, roles: ['coach'] },
  { href: '/student', label: 'Overview', icon: <LayoutGrid className="w-4 h-4" />, roles: ['student'] },
  { href: '/coach/sessions', label: 'Sessions', icon: <CalendarDays className="w-4 h-4" />, roles: ['coach', 'student'] },
  { href: '/coach/clips', label: 'Clips', icon: <Film className="w-4 h-4" />, roles: ['coach', 'student'] },
  { href: '/coach/students', label: 'Students', icon: <Users className="w-4 h-4" />, roles: ['coach'] },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [role, setRole] = useState<'coach' | 'student'>('coach');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (user?.role === 'student') setRole('student');
    else setRole('coach');
  }, [user]);

  // Close the mobile drawer on route change — otherwise navigating leaves it
  // open, stacked behind/over the new page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const visibleNav = navItems.filter((item) => item.roles.includes(role));

  const navLinks = (onNavigate: () => void = () => {}) => (
    <nav className="flex flex-col gap-0.5">
      {visibleNav.map((item) => {
        const isActive =
          item.href === pathname ||
          (item.href !== '/coach' && item.href !== '/student' && pathname?.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-sm text-sm transition-colors border-l-[3px] ${
              isActive
                ? 'bg-panel-2 text-ink font-medium border-brand pl-[10px]'
                : 'text-ink-muted hover:bg-panel-2 hover:text-ink border-transparent'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}

      <div className="h-px bg-hairline my-3 mx-2" />

      {(user?.role === 'studio_admin' || user?.role === 'platform_admin') && (
        <Link
          href="/coach/organization"
          onClick={onNavigate}
          aria-current={pathname === '/coach/organization' ? 'page' : undefined}
          className={`flex items-center gap-2.5 px-2.5 py-2 rounded-sm text-sm transition-colors border-l-[3px] ${
            pathname === '/coach/organization'
              ? 'bg-panel-2 text-ink font-medium border-brand pl-[10px]'
              : 'text-ink-muted hover:bg-panel-2 hover:text-ink border-transparent'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Organization</span>
        </Link>
      )}

      <Link
        href="/settings"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-2.5 py-2 rounded-sm text-sm text-ink-muted hover:bg-panel-2 hover:text-ink transition-colors"
      >
        <Settings className="w-4 h-4" />
        <span>Settings</span>
      </Link>
    </nav>
  );

  const userChip = (
    <div className="mt-auto flex items-center gap-2.5 p-2.5 rounded-md border border-hairline">
      <div className="w-7 h-7 rounded-full bg-analytics flex items-center justify-center text-[0.6875rem] font-bold text-white dark:text-canvas flex-shrink-0">
        {user?.displayName?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? 'U'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-ink truncate">{user?.displayName ?? 'User'}</div>
        <div className="text-[0.625rem] text-ink-faint truncate">{role} ▾</div>
      </div>
    </div>
  );

  const pageTitle = (() => {
    if (!pathname) return '';
    if (pathname === '/coach' || pathname === '/student') return 'Overview';
    if (pathname === '/student/sessions' || pathname === '/coach/sessions') return 'Sessions';
    if (pathname === '/student/clips' || pathname === '/coach/clips') return 'Clips';
    if (pathname === '/coach/students') return 'Students';
    return '';
  })();

  return (
    <div className="min-h-screen bg-canvas text-ink flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-[240px] flex-shrink-0 bg-panel border-r border-hairline flex-col py-5 px-3.5 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2.5 mb-6">
          <Logomark className="w-5 h-5 text-brand" />
          <div className="font-display text-sm font-medium">LetsMove</div>
          <span className="ml-auto font-mono text-[0.625rem] text-ink-faint uppercase">{role}</span>
        </div>

        {navLinks()}
        {userChip}
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div role="dialog" aria-modal="true" aria-label="Navigation menu" className="lg:hidden fixed inset-0 z-40">
          <div
            aria-hidden
            className="absolute inset-0 bg-canvas/70 backdrop-blur-sm animate-rise"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-[260px] max-w-[80vw] h-full bg-panel border-r border-hairline flex flex-col py-5 px-3.5 animate-rise">
            <div className="flex items-center gap-2.5 px-2.5 mb-6">
              <Logomark className="w-5 h-5 text-brand" />
              <div className="font-display text-sm font-medium">LetsMove</div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="ml-auto text-ink-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {navLinks(() => setMobileNavOpen(false))}
            {userChip}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-10 bg-panel/85 backdrop-blur-md border-b border-hairline px-4 sm:px-7 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full bg-panel-2 border border-hairline text-ink-muted hover:text-ink transition-colors flex-shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="font-display text-display-s">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search affordance */}
            <div className="hidden sm:flex items-center gap-2 bg-panel-2 border border-hairline rounded-full px-3.5 py-2 text-ink-faint text-xs">
              <span>⌕</span>
              <span>Search</span>
              <kbd className="font-mono text-[0.625rem] bg-hairline px-1.5 py-0.5 rounded">⌘K</kbd>
            </div>
            <Button href="/session/new" size="sm">+ New session</Button>
            <ThemeToggle />
            <UserMenu role={role} />
          </div>
        </header>

        {/* Content */}
        <main className="p-4 sm:p-7 max-w-7xl">
          {children}
        </main>
      </div>
    </div>
  );
}
