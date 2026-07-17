'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../../../../stores/auth-store';
import { apiClient } from '../../../../lib/api-client';
import { socket, connectSocket, disconnectSocket } from '../../../../lib/socket-client';
import { Lock, AlertTriangle, Hourglass, Ban, Clapperboard } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Pill } from '../../../components/ui/Pill';
import { IconBadge } from '../../../components/ui/StateBlocks';
import type { ReactNode } from 'react';

interface Session {
  id: string;
  coachId: string;
  status: string;
  accessType: 'public' | 'lobby';
  inviteCode: string;
}

function JoinShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-canvas text-ink p-6">
      <div className="max-w-md w-full bg-panel border border-hairline rounded-lg shadow-lg p-8 text-center animate-rise">
        {children}
      </div>
    </div>
  );
}

export default function SessionJoinPage({ params }: { params: { id: string } }) {
  const inviteCode = params.id;
  const router = useRouter();
  const { user, accessToken } = useAuthStore();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinStatus, setJoinStatus] = useState<'idle' | 'joining' | 'pending' | 'approved' | 'rejected'>('idle');

  // 1. Fetch Session Info
  useEffect(() => {
    if (!inviteCode) return;

    apiClient.get<Session>(`/sessions/by-invite/${inviteCode}`)
      .then((data) => {
        setSession(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('Session not found or invitation code invalid.');
        setLoading(false);
      });
  }, [inviteCode]);

  // 2. Handle joining security flow
  const handleJoin = async () => {
    if (!session || !accessToken) return;

    try {
      setJoinStatus('joining');
      const response = await apiClient.post<{ sessionId: string }, { status: 'approved' | 'pending' | 'rejected' }>(
        `/sessions/${session.id}/join`,
        { sessionId: session.id }
      );

      if (response.status === 'approved') {
        setJoinStatus('approved');
        router.push(`/session/${session.id}`);
      } else if (response.status === 'pending') {
        setJoinStatus('pending');
      } else {
        setJoinStatus('rejected');
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to submit join request. Please try again.');
      setJoinStatus('idle');
    }
  };

  // 3. Connect socket & watch for approvals in real-time when in pending lobby status
  useEffect(() => {
    if (joinStatus !== 'pending' || !session || !accessToken) return;

    connectSocket(accessToken);

    socket.emit('session:join', { sessionId: session.id }, (res: any) => {
      if (res?.status === 'error') {
        console.error('Failed to register socket lobby presence:', res.message);
      }
    });

    const handleApproved = (payload: { sessionId: string }) => {
      if (payload.sessionId === session.id) {
        setJoinStatus('approved');
        router.push(`/session/${session.id}`);
      }
    };

    const handleRejected = (payload: { sessionId: string }) => {
      if (payload.sessionId === session.id) {
        setJoinStatus('rejected');
        disconnectSocket();
      }
    };

    socket.on('lobby_approved', handleApproved);
    socket.on('lobby_rejected', handleRejected);

    return () => {
      socket.off('lobby_approved', handleApproved);
      socket.off('lobby_rejected', handleRejected);
    };
  }, [joinStatus, session, accessToken, router]);

  if (loading) {
    return (
      <JoinShell>
        <div className="w-12 h-12 border-4 border-brand/25 border-t-brand rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-semibold text-ink-muted">Verifying invite link...</p>
      </JoinShell>
    );
  }

  if (!accessToken) {
    return (
      <JoinShell>
        <IconBadge icon={Lock} tone="brand" />
        <h2 className="font-display text-display-s text-ink mb-2">Sign in required</h2>
        <p className="text-ink-muted text-sm mb-6">You must be signed in to join coaching sessions on LetsMove.</p>
        <Button href={`/login?redirect=/session/join/${inviteCode}`} className="w-full">Sign in & join session</Button>
      </JoinShell>
    );
  }

  if (error || !session) {
    return (
      <JoinShell>
        <IconBadge icon={AlertTriangle} tone="danger" />
        <h2 className="font-display text-display-s text-ink mb-2">Invite error</h2>
        <p className="text-ink-muted text-sm mb-6">{error || 'Unable to retrieve session invitation details.'}</p>
        <Button href="/dashboard" variant="ghost" className="w-full">Return to dashboard</Button>
      </JoinShell>
    );
  }

  if (joinStatus === 'pending') {
    return (
      <JoinShell>
        <IconBadge icon={Hourglass} tone="replay" />
        <h2 className="font-display text-display-s text-ink mb-2">Waiting for approval</h2>
        <p className="text-ink-muted text-sm mb-6">
          The coach has been notified of your request to join. Keep this tab open —
          you&apos;ll enter the room automatically once they approve you.
        </p>
        <div className="flex justify-center gap-2 mb-6" aria-hidden>
          <span className="w-2.5 h-2.5 rounded-full bg-replay animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2.5 h-2.5 rounded-full bg-replay animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2.5 h-2.5 rounded-full bg-replay animate-bounce" />
        </div>
        <Button href="/dashboard" variant="ghost" size="sm" className="w-full" onClick={() => disconnectSocket()}>
          Cancel request & exit
        </Button>
      </JoinShell>
    );
  }

  if (joinStatus === 'rejected') {
    return (
      <JoinShell>
        <IconBadge icon={Ban} tone="danger" />
        <h2 className="font-display text-display-s text-ink mb-2">Access declined</h2>
        <p className="text-ink-muted text-sm mb-6">Your request to join this session has been declined by the coach.</p>
        <Button href="/dashboard" variant="ghost" className="w-full">Return to dashboard</Button>
      </JoinShell>
    );
  }

  return (
    <JoinShell>
      <IconBadge icon={Clapperboard} tone="session" />
      <h2 className="font-display text-display-s text-ink mb-1">Session invitation</h2>
      <p className="text-xs text-ink-faint font-mono mb-6">{session.id}</p>

      <div className="bg-panel-2 border border-hairline rounded-sm p-4 text-left mb-6 flex flex-col gap-2.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-ink-muted">Security gate</span>
          <Pill variant={session.accessType === 'lobby' ? 'replay' : 'success'}>
            {session.accessType === 'lobby' ? 'Lobby approval needed' : 'Anyone can join'}
          </Pill>
        </div>
        <div className="h-px bg-hairline" />
        <div className="flex justify-between items-center text-xs">
          <span className="text-ink-muted">Current status</span>
          <span className="text-ink capitalize">{session.status}</span>
        </div>
      </div>

      <Button onClick={handleJoin} loading={joinStatus === 'joining'} className="w-full">
        {joinStatus === 'joining' ? 'Requesting access...' : 'Request to join room'}
      </Button>
    </JoinShell>
  );
}
