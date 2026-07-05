'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../lib/api-client';

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
        return 'bg-red-500/20 border-red-500/30 text-red-400';
      case 'scheduled':
        return 'bg-amber-500/20 border-amber-500/30 text-amber-400';
      case 'ended':
      case 'processed':
        return 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-400';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 pb-12">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-black text-white tracking-tight uppercase">
              Replay<span className="text-indigo-500">Coach</span>
            </h1>
            <nav className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
              <Link
                href="/coach/sessions"
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-slate-800 text-white"
              >
                Sessions
              </Link>
              <Link
                href="/coach/clips"
                className="px-4 py-1.5 rounded-md text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Clips Library
              </Link>
            </nav>
          </div>
        </header>

        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Coaching Sessions</h2>
              <p className="text-xs text-slate-400 mt-1">
                Create, join, or review your live coaching sessions.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setCreateAccessType('public')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition ${
                    createAccessType === 'public'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Public
                </button>
                <button
                  type="button"
                  onClick={() => setCreateAccessType('lobby')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition ${
                    createAccessType === 'lobby'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Lobby
                </button>
              </div>
              <button
                onClick={fetchSessions}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold text-slate-300 transition"
              >
                Refresh
              </button>
              <button
                onClick={handleCreateSession}
                disabled={creating}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : '+ New Session'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-950/30 border border-red-900 text-red-300 rounded-lg p-4 text-xs font-medium mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 gap-3">
              <div className="w-8 h-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
              <p className="text-xs text-slate-400">Loading Sessions...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-16 text-center max-w-xl mx-auto mt-6">
              <div className="text-4xl mb-4">🗓️</div>
              <h3 className="text-base font-bold text-white mb-2">No sessions yet</h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                Click &quot;+ New Session&quot; to create an instant live room. Share the session link with your students so they can join.
              </p>
              <button
                onClick={handleCreateSession}
                disabled={creating}
                className="inline-flex px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition disabled:opacity-50"
              >
                {creating ? 'Creating...' : '+ Create Your First Session'}
              </button>
            </div>
          ) : (
            <div className="border border-slate-800 bg-slate-900/40 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-900/60">
                    <th className="px-6 py-3">Room</th>
                    <th className="px-6 py-3">Access</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Scheduled</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {sessions.map((session) => (
                    <tr key={session.id} className="hover:bg-slate-900/30 transition">
                      <td className="px-6 py-4 font-mono text-xs text-slate-300">
                        {session.id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold capitalize text-slate-400">
                        {session.accessType ?? 'public'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md border text-[10px] uppercase font-bold tracking-wide ${getStatusBadgeClass(session.status)}`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {new Date(session.scheduledAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={() => handleCopyLink(session)}
                            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition"
                          >
                            {copiedSessionId === session.id ? 'Copied!' : 'Copy Invite'}
                          </button>
                          {['live', 'scheduled'].includes(session.status) ? (
                            <>
                              <button
                                onClick={() => handleStopSession(session.id)}
                                className="px-3.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/40 rounded-lg text-xs font-semibold transition"
                              >
                                Stop
                              </button>
                              <Link
                                href={`/session/${session.id}`}
                                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold transition"
                              >
                                Join Room
                              </Link>
                            </>
                          ) : (
                            <>
                              <Link
                                href={`/session/${session.id}?replay=true`}
                                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition"
                              >
                                Replay
                              </Link>
                              <Link
                                href={`/coach/clips?sessionId=${session.id}`}
                                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
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
