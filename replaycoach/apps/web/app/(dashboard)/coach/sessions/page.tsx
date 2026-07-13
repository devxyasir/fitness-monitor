'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../lib/api-client';
import { CalendarDays, Check } from 'lucide-react';
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
  accessType: 'public' | 'lobby';
  inviteCode: string;
}

export default function CoachSessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

  useEffect(() => { fetchSessions(); }, []);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<Session[]>('/sessions');
      setSessions(data);
      setError(null);
    } catch (err: any) {
      setError('Failed to load session history.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    try {
      setCreating(true);
      const session = await apiClient.post<any, Session>('/sessions', {
        scheduledAt: new Date().toISOString(),
        isInstant: true,
        accessType: 'public',
      });
      router.push(`/session/${session.id}`);
    } catch (err: any) {
      setError('Failed to create session. Please try again.');
      setCreating(false);
    }
  };

  const handleCopyLink = (session: Session) => {
    const inviteLink = `${window.location.origin}/session/join/${session.inviteCode}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopiedSessionId(session.id);
      setTimeout(() => setCopiedSessionId(null), 1500);
    });
  };

  const handleStopSession = async (sessionId: string) => {
    const confirm = window.confirm('Are you sure you want to stop this session?');
    if (!confirm) return;
    try {
      await apiClient.patch(`/sessions/${sessionId}/status`, { status: 'ended' });
      fetchSessions();
    } catch (err: any) {
      setError('Failed to stop session.');
    }
  };

  const statusPillVariant = (status: Session['status']): 'live' | 'scheduled' | 'ended' => {
    if (status === 'live') return 'live';
    if (status === 'scheduled') return 'scheduled';
    return 'ended';
  };

  return (
    <div className="space-y-6">
      {/* Top bar: create + refresh */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-semibold text-xl">Coaching Sessions</h2>
          <p className="text-xs text-ink-muted mt-1">Create, join, or review your live coaching sessions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchSessions} className="px-3.5 py-2 text-xs font-semibold text-ink bg-panel-2 border border-hairline rounded-full hover:bg-panel-2/80 transition-colors">
            Refresh
          </button>
          <button
            onClick={handleCreateSession}
            disabled={creating}
            className="px-4 py-2 text-xs font-semibold text-canvas bg-gradient-to-r from-brand-indigo to-brand-violet rounded-full hover:shadow-glow transition-all disabled:opacity-50"
          >
            {creating ? 'Creating...' : '+ New Session'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-3 text-xs font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-brand-indigo border-t-transparent animate-spin" />
          <p className="text-xs text-ink-muted">Loading sessions...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-hairline rounded-lg">
          <CalendarDays className="w-10 h-10 mx-auto text-ink-faint mb-4" />
          <h3 className="text-base font-bold text-ink mb-2">No sessions yet</h3>
          <p className="text-sm text-ink-muted max-w-sm mx-auto mb-6">
            Create an instant live room and share the link with your students.
          </p>
          <button
            onClick={handleCreateSession}
            disabled={creating}
            className="px-5 py-2.5 text-sm font-semibold text-canvas bg-gradient-to-r from-brand-indigo to-brand-violet rounded-full hover:shadow-glow transition-all disabled:opacity-50"
          >
            {creating ? 'Creating...' : '+ Create Your First Session'}
          </button>
        </div>
      ) : (
        <div className="bg-panel border border-hairline rounded-lg overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-panel-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                  <th className="px-5 py-3">Room</th>
                  <th className="px-5 py-3">Access</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Scheduled</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-panel-2/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-ink">{session.id.substring(0, 8)}...</td>
                    <td className="px-5 py-3.5 text-xs font-semibold capitalize text-ink-muted">{session.accessType ?? 'public'}</td>
                    <td className="px-5 py-3.5"><Pill variant={statusPillVariant(session.status)}>{session.status}</Pill></td>
                    <td className="px-5 py-3.5 text-xs text-ink-muted">{new Date(session.scheduledAt).toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end items-center gap-2">
                        <button onClick={() => handleCopyLink(session)} className="px-3 py-1.5 text-xs text-ink-muted border border-hairline rounded-full hover:bg-panel-2 transition-colors flex items-center gap-1">
                          {copiedSessionId === session.id ? <><Check className="w-3 h-3" /> Copied</> : 'Copy invite'}
                        </button>
                        {['live', 'scheduled'].includes(session.status) ? (
                          <>
                            <button onClick={() => handleStopSession(session.id)} className="px-3 py-1.5 text-xs text-danger border border-danger/30 rounded-full hover:bg-danger/10 transition-colors">Stop</button>
                            <Link href={`/session/${session.id}`} className="px-3.5 py-1.5 text-xs font-semibold text-canvas bg-live rounded-full hover:brightness-110 transition">Join Room</Link>
                          </>
                        ) : (
                          <>
                            <Link href={`/session/${session.id}?replay=true`} className="btn-ghost px-3 py-1.5 text-xs">Replay</Link>
                            <Link href={`/coach/clips?sessionId=${session.id}`} className="px-3 py-1.5 text-xs font-semibold text-canvas bg-gradient-to-r from-brand-indigo to-brand-violet rounded-full">Clips</Link>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-hairline">
            {sessions.map((session) => (
              <div key={session.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-ink">{session.id.substring(0, 8)}...</span>
                  <Pill variant={statusPillVariant(session.status)}>{session.status}</Pill>
                </div>
                <div className="text-xs text-ink-muted">{new Date(session.scheduledAt).toLocaleString()}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => handleCopyLink(session)} className="px-3 py-1.5 text-xs text-ink-muted border border-hairline rounded-full">
                    {copiedSessionId === session.id ? 'Copied' : 'Copy invite'}
                  </button>
                  {['live', 'scheduled'].includes(session.status) ? (
                    <>
                      <button onClick={() => handleStopSession(session.id)} className="px-3 py-1.5 text-xs text-danger border border-danger/30 rounded-full">Stop</button>
                      <Link href={`/session/${session.id}`} className="px-3 py-1.5 text-xs font-semibold text-canvas bg-live rounded-full">Join</Link>
                    </>
                  ) : (
                    <>
                      <Link href={`/session/${session.id}?replay=true`} className="btn-ghost px-3 py-1.5 text-xs">Replay</Link>
                      <Link href={`/coach/clips?sessionId=${session.id}`} className="px-3 py-1.5 text-xs font-semibold text-canvas bg-gradient-to-r from-brand-indigo to-brand-violet rounded-full">Clips</Link>
                    </>
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
