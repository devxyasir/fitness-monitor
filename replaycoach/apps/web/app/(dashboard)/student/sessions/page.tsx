'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../../lib/api-client';
import { RefreshCw, CalendarDays } from 'lucide-react';

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

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<Session[]>('/sessions');
      setSessions(data);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load your coaching sessions.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status: Session['status']) => {
    switch (status) {
      case 'live':
        return 'bg-live/10 border-live/30 text-live';
      case 'scheduled':
        return 'bg-replay/10 border-replay/30 text-replay';
      case 'ended':
      case 'processed':
        return 'bg-brand-indigo/10 border-brand-indigo/30 text-brand-indigo';
      default:
        return 'bg-panel-2 border-hairline text-ink-muted';
    }
  };

  return (
    <div className="min-h-screen font-sans p-6 pb-12">
      <div className="max-w-6xl mx-auto">
        {/* Navigation Sidebar/Header */}
        <header className="flex items-center justify-between mb-8 pb-4 border-b border-hairline">
          <div className="flex items-center gap-6">
            <h1 className="font-display text-2xl font-bold text-ink tracking-tight">
              Replay<span className="bg-gradient-to-r from-brand-indigo to-brand-violet bg-clip-text text-transparent">Coach</span>
            </h1>
            <nav className="flex items-center gap-1 bg-panel p-1 rounded-md border border-hairline">
              <Link
                href="/student/sessions"
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-panel-2 text-ink"
              >
                My Sessions
              </Link>
              <Link
                href="/student/clips"
                className="px-4 py-1.5 rounded-md text-xs font-semibold text-ink-muted hover:text-ink transition"
              >
                Shared Clips
              </Link>
            </nav>
          </div>
        </header>

        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display text-xl font-bold text-ink">My Sessions History</h2>
              <p className="text-xs text-ink-muted mt-1">
                View sessions you participated in and review clip notes shared with you.
              </p>
            </div>
            <button
              onClick={fetchSessions}
              className="btn-ghost px-3.5 py-1.5 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger rounded-md p-4 text-xs font-medium mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 gap-3">
              <div className="w-8 h-8 rounded-full border-4 border-brand-indigo border-t-transparent animate-spin" />
              <p className="text-xs text-ink-muted">Loading Sessions...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="card p-16 text-center max-w-xl mx-auto mt-6">
              <CalendarDays className="w-10 h-10 mb-4 mx-auto text-ink-faint" />
              <h3 className="text-base font-bold text-ink mb-2">No active sessions found</h3>
              <p className="text-xs text-ink-muted leading-relaxed mb-6">
                You will find your coaching session list here once you join a live session invitation.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-hairline text-[10px] font-bold uppercase tracking-wider text-ink-faint bg-panel-2">
                    <th className="px-6 py-4">Session Room Id</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Date Time</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {sessions.map((session) => (
                    <tr key={session.id} className="hover:bg-panel-2/50 transition group">
                      <td className="px-6 py-4 font-mono text-xs text-ink font-medium">
                        {session.id}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-md border text-[10px] uppercase font-bold tracking-wide ${getStatusBadgeClass(session.status)}`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-ink-muted font-medium">
                        {new Date(session.scheduledAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2.5">
                          {['live', 'scheduled'].includes(session.status) ? (
                            <Link
                              href={`/session/${session.id}`}
                              className="px-3.5 py-1.5 bg-live text-canvas hover:brightness-110 rounded-md text-xs font-semibold tracking-wide transition"
                            >
                              Join Room
                            </Link>
                          ) : (
                            <Link
                              href={`/student/clips?sessionId=${session.id}`}
                              className="btn-primary px-3.5 py-1.5 text-xs"
                            >
                              View Shared Clips
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
