'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../../lib/api-client';
import { RefreshCw, CalendarDays } from 'lucide-react';
import { Pill } from '../../../components/ui/Pill';

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

  const statusPill = (status: Session['status']): 'live' | 'scheduled' | 'ended' => {
    if (status === 'live') return 'live';
    if (status === 'scheduled') return 'scheduled';
    return 'ended';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-semibold text-xl">My Sessions</h2>
          <p className="text-xs text-ink-muted mt-1">View sessions you participated in and review clip notes shared with you.</p>
        </div>
        <button onClick={fetchSessions} className="px-3.5 py-2 text-xs font-semibold text-ink bg-panel-2 border border-hairline rounded-full hover:bg-panel-2/80 transition-colors inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-3 text-xs font-medium">{error}</div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-brand-indigo border-t-transparent animate-spin" />
          <p className="text-xs text-ink-muted">Loading sessions...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-hairline rounded-lg">
          <CalendarDays className="w-10 h-10 mx-auto text-ink-faint mb-4" />
          <h3 className="text-base font-bold text-ink mb-2">No active sessions found</h3>
          <p className="text-sm text-ink-muted max-w-sm mx-auto">You will find your coaching session list here once you join a live session invitation.</p>
        </div>
      ) : (
        <div className="bg-panel border border-hairline rounded-lg overflow-hidden">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-panel-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                  <th className="px-5 py-3">Session</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-panel-2/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-ink">{s.id.substring(0, 8)}...</td>
                    <td className="px-5 py-3.5"><Pill variant={statusPill(s.status)}>{s.status}</Pill></td>
                    <td className="px-5 py-3.5 text-xs text-ink-muted">{new Date(s.scheduledAt).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      {['live', 'scheduled'].includes(s.status) ? (
                        <Link href={`/session/${s.id}`} className="px-3.5 py-1.5 text-xs font-semibold text-canvas bg-live rounded-full hover:brightness-110 transition">Join Room</Link>
                      ) : (
                        <Link href={`/student/clips?sessionId=${s.id}`} className="btn-ghost px-3 py-1.5 text-xs">View Clips</Link>
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
                    <Link href={`/session/${s.id}`} className="inline-flex px-3 py-1.5 text-xs font-semibold text-canvas bg-live rounded-full">Join</Link>
                  ) : (
                    <Link href={`/student/clips?sessionId=${s.id}`} className="btn-ghost px-3 py-1.5 text-xs">View Clips</Link>
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
