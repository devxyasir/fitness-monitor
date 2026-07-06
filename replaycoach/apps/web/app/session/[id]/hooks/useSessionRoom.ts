'use client';

import { useEffect } from 'react';
import { socket, connectSocket } from '../../../../lib/socket-client';
import { useAuthStore } from '../../../../stores/auth-store';

/**
 * Joins the session's realtime room (`session:${sessionId}`) for the whole
 * lifetime of the session page — mount this once at the page level, not
 * inside a conditionally-rendered component (e.g. AnnotationCanvas only
 * mounts during DVR replay, so relying on it to join the room meant a coach
 * never in replay mode was never in the room at all: reference:open,
 * session:pin-track, lobby approvals, and every other room broadcast
 * silently never arrived).
 *
 * Re-joins on every 'connect' event, not just once on mount — a
 * disconnected/reconnected transport (server restart, network blip) gets a
 * brand-new Socket.IO session server-side that isn't in any room until it
 * rejoins, even though the client looks "connected" with no visible error.
 */
export function useSessionRoom(sessionId: string): void {
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken || !sessionId) return;

    connectSocket(accessToken);

    const joinRoom = () => {
      socket.emit('session:join', { sessionId }, (res: any) => {
        if (res?.status === 'error') {
          console.error('Failed to join session realtime room:', res.message);
        }
      });
    };

    joinRoom();
    socket.on('connect', joinRoom);

    return () => {
      socket.off('connect', joinRoom);
    };
  }, [accessToken, sessionId]);
}
