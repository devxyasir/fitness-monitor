'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { LayoutGrid, CalendarDays, Film, Users, Settings } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';
import { ThemeToggle } from '../components/ThemeToggle';

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

  useEffect(() => {
    if (user?.role === 'student') setRole('student');
    else setRole('coach');
  }, [user]);

  const visibleNav = navItems.filter((item) => item.roles.includes(role));

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
        {/* Wordmark */}
        <div className="flex items-center gap-2.5 px-2.5 mb-6">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-brand-indigo to-brand-violet flex items-center justify-center">
            <span className="text-[9px] font-bold text-canvas">◇</span>
          </div>
          <div className="font-display font-semibold text-sm">ReplayCoach</div>
          <span className="ml-auto font-mono text-[0.625rem] text-ink-faint uppercase">{role}</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5">
          {visibleNav.map((item) => {
            const isActive =
              item.href === pathname ||
              (item.href !== '/coach' && item.href !== '/student' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-panel-2 text-ink font-medium border-l-[3px] border-brand-indigo pl-[10px]'
                    : 'text-ink-muted hover:bg-panel-2 hover:text-ink border-l-[3px] border-transparent'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div className="h-px bg-hairline my-3 mx-2" />

          <Link
            href="/settings"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-ink-muted hover:bg-panel-2 hover:text-ink transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </Link>
        </nav>

        {/* User chip */}
        <div className="mt-auto flex items-center gap-2.5 p-2.5 rounded-lg border border-hairline">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-indigo to-brand-violet flex items-center justify-center text-[0.6875rem] font-bold text-canvas flex-shrink-0">
            {user?.displayName?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{user?.displayName ?? 'User'}</div>
            <div className="text-[0.625rem] text-ink-faint truncate">{role} ▾</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-10 bg-panel/60 backdrop-blur-glass border-b border-hairline px-7 py-4 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="font-display font-semibold text-lg">{pageTitle}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search affordance */}
            <div className="hidden sm:flex items-center gap-2 bg-panel-2 border border-hairline rounded-full px-3.5 py-2 text-ink-faint text-xs">
              <span>⌕</span>
              <span>Search</span>
              <kbd className="font-mono text-[0.625rem] bg-hairline px-1.5 py-0.5 rounded">⌘K</kbd>
            </div>
            <Link
              href="/session/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-canvas bg-gradient-to-r from-brand-indigo to-brand-violet hover:shadow-glow transition-all"
            >
              + New session
            </Link>
            <ThemeToggle />
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-indigo to-brand-violet flex items-center justify-center text-[0.6875rem] font-bold text-canvas">
              {user?.displayName?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? 'U'}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-7 max-w-7xl">
          {children}
        </main>
      </div>
    </div>
  );
}
