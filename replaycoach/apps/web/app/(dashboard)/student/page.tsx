'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { CalendarDays } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StateBlock, SkeletonRows, ErrorBlock } from '../../components/ui/StateBlocks';

interface StudentStats {
  sessionsAttended: number;
  nextSession: { time: string; title: string; sessionId: string } | null;
  clipsShared: number;
}

interface StudentOverviewResponse {
  stats: StudentStats;
  recentSessions: { id: string; title: string; date: string }[];
}

export default function StudentOverviewPage() {
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [recentSessions, setRecentSessions] = useState<{ id: string; title: string; date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.get<StudentOverviewResponse>('/dashboard/student/overview');
      setStats(data.stats);
      setRecentSessions(data.recentSessions);
    } catch (err) {
      console.error(err);
      setError('Could not load your dashboard. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <ErrorBlock message={error} onRetry={fetchOverview} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card accent="analytics">
          <div className="text-xs text-ink-muted mb-2 pl-2">Sessions attended</div>
          <div className="font-mono font-medium text-lg text-ink pl-2">{loading ? '—' : stats?.sessionsAttended ?? 0}</div>
        </Card>

        <Card accent="success" className="bg-success/5 border-success/20">
          <div className="text-xs text-ink-muted mb-2">Next session</div>
          {loading ? (
            <SkeletonRows count={1} />
          ) : stats?.nextSession ? (
            <>
              <div className="text-sm font-semibold text-ink">{stats.nextSession.time}</div>
              <Button href={`/session/${stats.nextSession.sessionId}`} variant="session" size="sm" className="mt-2">Join</Button>
            </>
          ) : (
            <div className="text-sm text-ink-muted">No upcoming sessions</div>
          )}
        </Card>

        <Card accent="analytics">
          <div className="text-xs text-ink-muted mb-2 pl-2">Clips shared with you</div>
          <div className="font-mono font-medium text-lg text-ink pl-2">{loading ? '—' : stats?.clipsShared ?? 0}</div>
        </Card>
      </div>

      <div className="bg-panel border border-hairline rounded-md p-5">
        <h2 className="font-display text-display-s mb-4">Recent sessions</h2>
        {loading ? (
          <SkeletonRows count={3} />
        ) : recentSessions.length === 0 ? (
          <StateBlock icon={<CalendarDays className="w-full h-full" />} title="No sessions yet" body="Your coach will invite you to one." />
        ) : (
          <div className="flex flex-col">
            {recentSessions.map((s) => (
              <div key={s.id} className="flex justify-between items-center py-3 border-b border-hairline last:border-0">
                <span className="text-sm text-ink">{s.title}</span>
                <span className="font-mono text-xs text-ink-faint">{s.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
