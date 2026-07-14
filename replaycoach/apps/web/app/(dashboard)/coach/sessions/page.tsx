'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Check } from 'lucide-react';
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
  accessType: 'public' | 'lobby';
  inviteCode: string;
}

function statusPillVariant(status: Session['status']): 'success' | 'scheduled' | 'ended' {
  if (status === 'live') return 'success';
  if (status === 'scheduled') return 'scheduled';
  return 'ended';
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

  return (
    <div className="space-y-6">
      {/* Top bar: create + refresh */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-display-m">Coaching sessions</h2>
          <p className="text-xs text-ink-muted mt-1">Create, join, or review your live coaching sessions.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={fetchSessions}>Refresh</Button>
          <Button size="sm" loading={creating} onClick={handleCreateSession}>+ New session</Button>
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={fetchSessions} />}

      {loading ? (
        <SkeletonRows count={5} />
      ) : sessions.length === 0 ? (
        <StateBlock
          icon={<CalendarDays className="w-full h-full" />}
          title="No sessions yet"
          body="Create an instant live room and share the link with your students."
          action={<Button loading={creating} onClick={handleCreateSession}>+ Create your first session</Button>}
        />
      ) : (
        <div className="bg-panel border border-hairline rounded-md overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-panel-2 text-label text-ink-faint uppercase">
                  <th className="px-5 py-3">Room</th>
                  <th className="px-5 py-3">Access</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Scheduled</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-panel-2/40 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-ink">{session.id.substring(0, 8)}...</td>
                    <td className="px-5 py-3.5 text-xs font-semibold capitalize text-ink-muted">{session.accessType ?? 'public'}</td>
                    <td className="px-5 py-3.5"><Pill variant={statusPillVariant(session.status)}>{session.status}</Pill></td>
                    <td className="px-5 py-3.5 text-xs text-ink-muted">{new Date(session.scheduledAt).toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleCopyLink(session)}>
                          {copiedSessionId === session.id ? <><Check className="w-3 h-3" /> Copied</> : 'Copy invite'}
                        </Button>
                        {['live', 'scheduled'].includes(session.status) ? (
                          <>
                            <Button variant="danger" size="sm" onClick={() => handleStopSession(session.id)}>Stop</Button>
                            <Button variant="session" size="sm" href={`/session/${session.id}`}>Join room</Button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" size="sm" href={`/session/${session.id}?replay=true`}>Replay</Button>
                            <Button variant="analytics" size="sm" href={`/coach/clips?sessionId=${session.id}`}>Clips</Button>
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
                  <Button variant="ghost" size="sm" onClick={() => handleCopyLink(session)}>
                    {copiedSessionId === session.id ? 'Copied' : 'Copy invite'}
                  </Button>
                  {['live', 'scheduled'].includes(session.status) ? (
                    <>
                      <Button variant="danger" size="sm" onClick={() => handleStopSession(session.id)}>Stop</Button>
                      <Button variant="session" size="sm" href={`/session/${session.id}`}>Join</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" href={`/session/${session.id}?replay=true`}>Replay</Button>
                      <Button variant="analytics" size="sm" href={`/coach/clips?sessionId=${session.id}`}>Clips</Button>
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
