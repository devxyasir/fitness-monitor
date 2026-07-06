'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../lib/api-client';
import { CalendarDays } from 'lucide-react';

interface Session {
  id: string;
  coachId: string;
  orgId: string | null;
  status: 'scheduled' | 'live' | 'ended' | 'processed' | 'archived';
  livekitRoomName: string;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  accessType: 'public' | 'lobby';
  inviteCode: string;
}

export default function CoachSessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createAccessType, setCreateAccessType] = useState<'public' | 'lobby'>('public');
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

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
      setError('Failed to load session history.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    try {
      setCreating(true);
      const session = await apiClient.post<any, Session>(
        '/sessions',
        {
          scheduledAt: new Date().toISOString(),
          isInstant: true,
          accessType: createAccessType,
        },
      );
      router.push(`/session/${session.id}`);
    } catch (err: any) {
      console.error(err);
      setError('Failed to create session. Please try again.');
      setCreating(false);
    }
  };

  const handleCopyLink = (session: Session) => {
    const inviteLink = `${window.location.origin}/session/join/${session.inviteCode}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopiedSessionId(session.id);
      setTimeout(() => setCopiedSessionId(null), 2000);
    });
  };

  const handleStopSession = async (sessionId: string) => {
    const confirm = window.confirm(
      'Are you sure you want to stop this session? This will disconnect all participants and prevent anyone from joining.'
    );
    if (!confirm) return;

    try {
      await apiClient.patch(`/sessions/${sessionId}/status`, { status: 'ended' });
      fetchSessions();
    } catch (err: any) {
      console.error(err);
      setError('Failed to stop session. Please try again.');
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
        {/* Header */}
        <header className="flex items-center justify-between mb-8 pb-4 border-b border-hairline">
          <div className="flex items-center gap-6">
            <h1 className="font-display text-2xl font-bold text-ink tracking-tight">
              Replay<span className="bg-gradient-to-r from-brand-indigo to-brand-violet bg-clip-text text-transparent">Coach</span>
            </h1>
            <nav className="flex items-center gap-1 bg-panel p-1 rounded-md border border-hairline">
              <Link
                href="/coach/sessions"
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-panel-2 text-ink"
              >
                Sessions
              </Link>
              <Link
                href="/coach/clips"
                className="px-4 py-1.5 rounded-md text-xs font-semibold text-ink-muted hover:text-ink transition"
              >
                Clips Library
              </Link>
            </nav>
          </div>
        </header>

        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display text-xl font-bold text-ink">Coaching Sessions</h2>
              <p className="text-xs text-ink-muted mt-1">
                Create, join, or review your live coaching sessions.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-panel border border-hairline rounded-md p-1">
                <button
                  type="button"
                  onClick={() => setCreateAccessType('public')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition ${
                    createAccessType === 'public'
                      ? 'bg-brand-indigo text-white'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Public
                </button>
                <button
                  type="button"
                  onClick={() => setCreateAccessType('lobby')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition ${
                    createAccessType === 'lobby'
                      ? 'bg-brand-indigo text-white'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Lobby
                </button>
              </div>
              <button
                onClick={fetchSessions}
                className="btn-ghost px-3.5 py-2 text-xs"
              >
                Refresh
              </button>
              <button
                onClick={handleCreateSession}
                disabled={creating}
                className="btn-primary px-4 py-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : '+ New Session'}
              </button>
            </div>
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
              <h3 className="text-base font-bold text-ink mb-2">No sessions yet</h3>
              <p className="text-sm text-ink-muted leading-relaxed mb-6">
                Click &quot;+ New Session&quot; to create an instant live room. Share the session link with your students so they can join.
              </p>
              <button
                onClick={handleCreateSession}
                disabled={creating}
                className="btn-primary inline-flex px-5 py-2.5 text-sm disabled:opacity-50"
              >
                {creating ? 'Creating...' : '+ Create Your First Session'}
              </button>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-hairline text-[11px] font-bold uppercase tracking-wider text-ink-faint bg-panel-2">
                    <th className="px-6 py-3">Room</th>
                    <th className="px-6 py-3">Access</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Scheduled</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {sessions.map((session) => (
                    <tr key={session.id} className="hover:bg-panel-2/50 transition">
                      <td className="px-6 py-4 font-mono text-xs text-ink">
                        {session.id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold capitalize text-ink-muted">
                        {session.accessType ?? 'public'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md border text-[10px] uppercase font-bold tracking-wide ${getStatusBadgeClass(session.status)}`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-ink-muted">
                        {new Date(session.scheduledAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={() => handleCopyLink(session)}
                            className="btn-ghost px-3.5 py-1.5 text-xs"
                          >
                            {copiedSessionId === session.id ? 'Copied!' : 'Copy Invite'}
                          </button>
                          {['live', 'scheduled'].includes(session.status) ? (
                            <>
                              <button
                                onClick={() => handleStopSession(session.id)}
                                className="btn-danger px-3.5 py-1.5 text-xs"
                              >
                                Stop
                              </button>
                              <Link
                                href={`/session/${session.id}`}
                                className="px-3.5 py-1.5 bg-live text-canvas hover:brightness-110 rounded-md text-xs font-semibold transition"
                              >
                                Join Room
                              </Link>
                            </>
                          ) : (
                            <>
                              <Link
                                href={`/session/${session.id}?replay=true`}
                                className="btn-ghost px-3.5 py-1.5 text-xs"
                              >
                                Replay
                              </Link>
                              <Link
                                href={`/coach/clips?sessionId=${session.id}`}
                                className="btn-primary px-3.5 py-1.5 text-xs"
                              >
                                Clips
                              </Link>
                            </>
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
