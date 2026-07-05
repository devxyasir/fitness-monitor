'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../../../../stores/auth-store';
import { apiClient } from '../../../../lib/api-client';
import { socket, connectSocket, disconnectSocket } from '../../../../lib/socket-client';

interface Session {
  id: string;
  coachId: string;
  status: string;
  accessType: 'public' | 'lobby';
  inviteCode: string;
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

    // Join the session channel to listen to approvals
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

  // Render Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-indigo-400 rounded-full animate-spin"></div>
          <p className="text-sm font-semibold text-slate-400">Verifying invite link...</p>
        </div>
      </div>
    );
  }

  // Render Unauthenticated
  if (!accessToken) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl text-center">
          <div className="w-16 h-16 bg-indigo-950 border border-indigo-805 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-500 text-3xl">
            🔒
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Authentication Required</h2>
          <p className="text-slate-400 mb-6 text-sm">
            You must be signed in to join coaching sessions on ReplayCoach.
          </p>
          <Link
            href={`/login?redirect=/session/join/${inviteCode}`}
            className="flex justify-center items-center w-full px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
          >
            Sign In & Join Session
          </Link>
        </div>
      </div>
    );
  }

  // Render Error / Session Not Found
  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl text-center">
          <div className="w-16 h-16 bg-red-950 border border-red-800 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 text-3xl">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Invite Error</h2>
          <p className="text-slate-400 mb-6 text-sm">
            {error || 'Unable to retrieve session invitation details.'}
          </p>
          <Link
            href="/dashboard"
            className="inline-flex justify-center items-center w-full px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium transition"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Render Lobby Waiting Room for Student
  if (joinStatus === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500 animate-pulse" />
          <div className="w-16 h-16 bg-amber-950/40 border border-amber-900/60 rounded-full flex items-center justify-center mx-auto mb-6 text-amber-500 text-2xl animate-pulse">
            ⏳
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Waiting for Approval</h2>
          <p className="text-slate-400 mb-6 text-sm">
            The coach has been notified of your request to join. Keep this tab open; you will enter the room automatically when they approve you.
          </p>
          <div className="flex justify-center gap-2 mb-6">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce"></span>
          </div>
          <Link
            href="/dashboard"
            onClick={() => disconnectSocket()}
            className="inline-flex justify-center items-center w-full px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold transition"
          >
            Cancel Request & Exit
          </Link>
        </div>
      </div>
    );
  }

  // Render Rejected State
  if (joinStatus === 'rejected') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl text-center">
          <div className="w-16 h-16 bg-red-950/40 border border-red-900/60 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 text-3xl">
            🚫
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Declined</h2>
          <p className="text-slate-400 mb-6 text-sm">
            Your request to join this session has been declined by the coach.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex justify-center items-center w-full px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium transition"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Render Join Prompt Button for new entrants
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl text-center">
        <div className="w-16 h-16 bg-indigo-950/80 border border-indigo-900/60 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-400 text-3xl">
          🎬
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Session Invitation</h2>
        <p className="text-xs text-slate-500 font-mono mb-6">{session.id}</p>
        
        <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 text-left mb-6 flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Security Gate:</span>
            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
              session.accessType === 'lobby' 
                ? 'bg-amber-500/20 text-amber-400 border border-amber-505/35'
                : 'bg-green-500/20 text-green-400 border border-green-550/35'
            }`}>
              {session.accessType === 'lobby' ? 'Lobby Approval Needed' : 'Anyone Can Join'}
            </span>
          </div>
          <div className="h-px bg-slate-850" />
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Current Status:</span>
            <span className="text-slate-350 capitalize">{session.status}</span>
          </div>
        </div>

        <button
          onClick={handleJoin}
          disabled={joinStatus === 'joining'}
          className="flex justify-center items-center w-full px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition disabled:opacity-50"
        >
          {joinStatus === 'joining' ? 'Requesting Access...' : 'Request to Join Room'}
        </button>
      </div>
    </div>
  );
}
