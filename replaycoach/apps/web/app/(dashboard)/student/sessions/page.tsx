'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
        {/* Navigation Sidebar/Header */}
        <header className="flex items-center justify-between mb-8 pb-4 border-b border-slate-900">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-black text-white tracking-tight uppercase">
              Replay<span className="text-indigo-500">Coach</span>
            </h1>
            <nav className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <Link
                href="/student/sessions"
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white shadow"
              >
                My Sessions
              </Link>
              <Link
                href="/student/clips"
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Shared Clips
              </Link>
            </nav>
          </div>
        </header>

        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">My Sessions History</h2>
              <p className="text-xs text-slate-400 mt-1">
                View sessions you participated in and review clip notes shared with you.
              </p>
            </div>
            <button
              onClick={fetchSessions}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 transition"
            >
              🔄 Refresh
            </button>
          </div>

          {error && (
            <div className="bg-red-950/20 border border-red-900 text-red-300 rounded-2xl p-4 text-xs font-medium mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 gap-3">
              <div className="w-8 h-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
              <p className="text-xs text-slate-400">Loading Sessions...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-16 text-center max-w-xl mx-auto mt-6">
              <div className="text-4xl mb-4">🗓️</div>
              <h3 className="text-base font-bold text-white mb-2">No active sessions found</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                You will find your coaching session list here once you join a live session invitation.
              </p>
            </div>
          ) : (
            <div className="border border-slate-900 bg-slate-900/30 rounded-3xl overflow-hidden shadow-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-900/40">
                    <th className="px-6 py-4">Session Room Id</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Date Time</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/50">
                  {sessions.map((session) => (
                    <tr key={session.id} className="hover:bg-slate-900/20 transition group">
                      <td className="px-6 py-4 font-mono text-xs text-slate-300 font-medium">
                        {session.id}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-lg border text-[10px] uppercase font-bold tracking-wide ${getStatusBadgeClass(session.status)}`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400 font-medium">
                        {new Date(session.scheduledAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2.5">
                          {['live', 'scheduled'].includes(session.status) ? (
                            <Link
                              href={`/session/${session.id}`}
                              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold tracking-wide transition shadow-sm"
                            >
                              Join Room
                            </Link>
                          ) : (
                            <Link
                              href={`/student/clips?sessionId=${session.id}`}
                              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold tracking-wide transition shadow-sm animate-pulse-subtle"
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
