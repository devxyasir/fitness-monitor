'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../lib/api-client';
import { CalendarDays, Film } from 'lucide-react';

interface StudentStats {
  sessionsAttended: number;
  nextSession: { time: string; title: string; sessionId: string } | null;
  clipsShared: number;
}

export default function StudentOverviewPage() {
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [recentSessions, setRecentSessions] = useState<{ id: string; title: string; date: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setStats({ sessionsAttended: 0, nextSession: null, clipsShared: 0 });
      setRecentSessions([]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-panel border border-hairline rounded-lg p-5">
          <div className="text-xs text-ink-muted mb-2">Sessions attended</div>
          <div className="font-mono font-medium text-lg">{loading ? '—' : stats?.sessionsAttended ?? 0}</div>
        </div>
        <div className="bg-live/5 border border-live/20 rounded-lg p-5">
          <div className="text-xs text-ink-muted mb-2">Next session</div>
          {loading ? (
            <div className="text-sm text-ink-muted">Loading...</div>
          ) : stats?.nextSession ? (
            <>
              <div className="text-sm font-semibold">{stats.nextSession.time}</div>
              <Link href={`/session/${stats.nextSession.sessionId}`} className="inline-flex mt-2 text-xs font-semibold text-canvas bg-live rounded-full px-3 py-1.5 hover:brightness-110 transition">
                Join
              </Link>
            </>
          ) : (
            <div className="text-sm text-ink-muted">No upcoming sessions</div>
          )}
        </div>
        <div className="bg-panel border border-hairline rounded-lg p-5">
          <div className="text-xs text-ink-muted mb-2">Clips shared with you</div>
          <div className="font-mono font-medium text-lg">{loading ? '—' : stats?.clipsShared ?? 0}</div>
        </div>
      </div>

      {/* Recent sessions */}
      <div className="bg-panel border border-hairline rounded-lg p-5">
        <h2 className="font-display font-semibold text-[1.0625rem] mb-4">Recent sessions</h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-6 bg-panel-2 rounded animate-shimmer" />)}
          </div>
        ) : recentSessions.length === 0 ? (
          <div className="text-center py-8">
            <CalendarDays className="w-8 h-8 mx-auto text-ink-faint mb-3" />
            <p className="text-sm text-ink-muted">No sessions yet — your coach will invite you to one.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {recentSessions.map((s) => (
              <div key={s.id} className="flex justify-between items-center py-3 border-b border-hairline last:border-0">
                <span className="text-sm">{s.title}</span>
                <span className="font-mono text-xs text-ink-faint">{s.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
