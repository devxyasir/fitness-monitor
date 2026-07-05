'use client';

import { useEffect } from 'react';
import { socket, connectSocket } from '../../../../lib/socket-client';
import { useAuthStore } from '../../../../stores/auth-store';
import { useReplayStore } from '../../../../stores/replay-store';

export function useReplaySocket(sessionId: string) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setManifestUrl = useReplayStore((s) => s.setManifestUrl);
  const setParticipantId = useReplayStore((s) => s.setParticipantId);
  const setMode = useReplayStore((s) => s.setMode);
  const setTimestamp = useReplayStore((s) => s.setTimestamp);
  const resetReplay = useReplayStore((s) => s.reset);

  useEffect(() => {
    if (!accessToken || !sessionId) return;

    // Ensure socket is connected and authenticated
    connectSocket(accessToken);

    const handleReplayStart = (payload: {
      participantId: string;
      fromOffsetMs: number;
      toOffsetMs: number;
    }) => {
      setParticipantId(payload.participantId);
      setTimestamp(payload.fromOffsetMs);
      setMode('playing');
    };

    const handleReplayEnd = () => {
      resetReplay();
    };

    socket.on('session:replay:start', handleReplayStart);
    socket.on('session:replay:end', handleReplayEnd);

    return () => {
      socket.off('session:replay:start', handleReplayStart);
      socket.off('session:replay:end', handleReplayEnd);
    };
  }, [accessToken, sessionId, setManifestUrl, setParticipantId, setTimestamp, setMode, resetReplay]);
}

