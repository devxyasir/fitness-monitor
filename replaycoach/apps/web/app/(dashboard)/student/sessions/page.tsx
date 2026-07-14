'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, CalendarDays } from 'lucide-react';
import { apiClient } from '../../../../lib/api-client';
import { Pill } from '../../../components/ui/Pill';
import { Button } from '../../../components/ui/Button';
import { StateBlock, SkeletonRows, ErrorBlock } from '../../../components/ui/StateBlocks';

interface Session {
  id: string;
  coachId: string;
  orgId: string | null;
  status: 'scheduled' | 'live' | 'ended' | 'processed' | 'archived';
  livekitRoomName: string;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

function statusPill(status: Session['status']): 'success' | 'scheduled' | 'ended' {
  if (status === 'live') return 'success';
  if (status === 'scheduled') return 'scheduled';
  return 'ended';
}

export default function StudentSessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchSessions(); }, []);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<Session[]>('/sessions');
      setSessions(data);
      setError(null);
    } catch (err: any) {
      setError('Failed to load your coaching sessions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-display-m">My sessions</h2>
          <p className="text-xs text-ink-muted mt-1">View sessions you participated in and review clip notes shared with you.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchSessions}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {error && <ErrorBlock message={error} onRetry={fetchSessions} />}

      {loading ? (
        <SkeletonRows count={5} />
      ) : sessions.length === 0 ? (
        <StateBlock
          icon={<CalendarDays className="w-full h-full" />}
          title="No active sessions found"
          body="You'll find your coaching session list here once you join a live session invitation."
        />
      ) : (
        <div className="bg-panel border border-hairline rounded-md overflow-hidden">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-panel-2 text-label text-ink-faint uppercase">
                  <th className="px-5 py-3">Session</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-panel-2/40 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-ink">{s.id.substring(0, 8)}...</td>
                    <td className="px-5 py-3.5"><Pill variant={statusPill(s.status)}>{s.status}</Pill></td>
                    <td className="px-5 py-3.5 text-xs text-ink-muted">{new Date(s.scheduledAt).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      {['live', 'scheduled'].includes(s.status) ? (
                        <Button variant="session" size="sm" href={`/session/${s.id}`}>Join room</Button>
                      ) : (
                        <Button variant="ghost" size="sm" href={`/student/clips?sessionId=${s.id}`}>View clips</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-hairline">
            {sessions.map((s) => (
              <div key={s.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-ink">{s.id.substring(0, 8)}...</span>
                  <Pill variant={statusPill(s.status)}>{s.status}</Pill>
                </div>
                <div className="text-xs text-ink-muted">{new Date(s.scheduledAt).toLocaleString()}</div>
                <div>
                  {['live', 'scheduled'].includes(s.status) ? (
                    <Button variant="session" size="sm" href={`/session/${s.id}`}>Join</Button>
                  ) : (
                    <Button variant="ghost" size="sm" href={`/student/clips?sessionId=${s.id}`}>View clips</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
