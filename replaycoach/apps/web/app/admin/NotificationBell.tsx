'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import type { AdminNotificationDto } from '@replaycoach/types';
import { adminNotificationsClient } from '../../lib/admin-notifications-client';
import { countryNameForCode } from '../../lib/iso-countries';

const POLL_INTERVAL_MS = 45_000;

function describe(n: AdminNotificationDto): string {
  if (n.kind === 'geo_blocked') {
    return `Blocked login attempt from ${n.countryCode ? countryNameForCode(n.countryCode) : 'an unknown location'}`;
  }
  const action = (n.action ?? '').replace(/[._]/g, ' ');
  return n.actorName ? `${n.actorName} — ${action}` : action;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Poll-based, not real-time push — deliberately, see
 * admin-notifications.service.ts's doc comment. Reuses audit_logs +
 * geo_access_logs, no new "events" table. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await adminNotificationsClient.getFeed();
      setItems(res.items);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      console.error('[NotificationBell] Failed to load feed:', err);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

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

  const handleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      setUnreadCount(0);
      try {
        await adminNotificationsClient.markSeen();
      } catch (err) {
        console.error('[NotificationBell] Failed to mark seen:', err);
      }
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative w-8 h-8 flex items-center justify-center rounded-full text-ink-faint hover:text-ink hover:bg-panel-2 transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold leading-4 text-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-panel border border-hairline rounded-md shadow-lg animate-rise z-30"
        >
          <div className="px-3.5 py-2.5 border-b border-hairline text-[10px] font-mono uppercase tracking-widest text-ink-faint">
            Recent activity
          </div>
          {items.length === 0 ? (
            <div className="px-3.5 py-6 text-sm text-ink-faint text-center">Nothing new.</div>
          ) : (
            <div className="divide-y divide-hairline">
              {items.map((n) => (
                <Link
                  key={n.id}
                  href={n.kind === 'geo_blocked' ? '/admin/geo-logs' : '/admin/audit'}
                  onClick={() => setOpen(false)}
                  className="block px-3.5 py-2.5 hover:bg-panel-2 transition-colors"
                >
                  <div className="text-sm text-ink truncate">{describe(n)}</div>
                  <div className="text-xs text-ink-faint mt-0.5">{timeAgo(n.createdAt)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
