'use client';

import { useEffect } from 'react';
import { socket, connectSocket } from '../../../../lib/socket-client';
import { useAuthStore } from '../../../../stores/auth-store';
import { useAnnotationStore, ClientAnnotation } from '../../../../stores/annotation-store';

export function useAnnotationSocket(sessionId: string) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);
  const undoLastAnnotation = useAnnotationStore((s) => s.undoLastAnnotation);
  const clearAnnotations = useAnnotationStore((s) => s.clearAnnotations);

  useEffect(() => {
    if (!accessToken || !sessionId) return;

    // Connect socket using the token
    connectSocket(accessToken);

    // Join the session channel. Re-emitted on every 'connect' (not just once
    // on mount) — a dropped/reconnected transport (server restart, network
    // blip) gets a brand-new Socket.IO session server-side that isn't in any
    // room until it rejoins, even though the client looks "connected" and
    // gives no visible error. Without this, every broadcast (annotations,
    // reference:open, replay sync, lobby approvals) silently stops arriving
    // after any reconnect.
    const joinRoom = () => {
      socket.emit('session:join', { sessionId }, (res: any) => {
        if (res?.status === 'error') {
          console.error('Failed to join session realtime room:', res.message);
        }
      });
    };

    joinRoom();
    socket.on('connect', joinRoom);

    // Register event listeners
    const handleDraw = (payload: any) => {
      addAnnotation(payload);
    };

    const handleUndo = (payload: { frameTimestampMs: number }) => {
      undoLastAnnotation(payload.frameTimestampMs);
    };

    const handleClear = (payload: { frameTimestampMs: number }) => {
      clearAnnotations(payload.frameTimestampMs);
    };

    socket.on('annotation:draw', handleDraw);
    socket.on('annotation:undo', handleUndo);
    socket.on('annotation:clear', handleClear);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('annotation:draw', handleDraw);
      socket.off('annotation:undo', handleUndo);
      socket.off('annotation:clear', handleClear);
    };
  }, [accessToken, sessionId, addAnnotation, undoLastAnnotation, clearAnnotations]);

  const drawAnnotation = (annotation: ClientAnnotation, studentIds?: string[]) => {
    socket.emit('annotation:draw', {
      sessionId,
      payload: annotation,
      studentIds,
    });
  };

  const undoAnnotation = (frameTimestampMs: number, studentIds?: string[]) => {
    socket.emit('annotation:undo', {
      sessionId,
      frameTimestampMs,
      studentIds,
    });
  };

  const clearAnnotationLayer = (frameTimestampMs: number, studentIds?: string[]) => {
    socket.emit('annotation:clear', {
      sessionId,
      frameTimestampMs,
      studentIds,
    });
  };

  return {
    drawAnnotation,
    undoAnnotation,
    clearAnnotationLayer,
  };
}
