'use client';

import { useCallback, useEffect } from 'react';
import { socket, connectSocket } from '../../../../lib/socket-client';
import { useAuthStore } from '../../../../stores/auth-store';
import { apiClient } from '../../../../lib/api-client';
import { useAnnotationStore, ClientAnnotation } from '../../../../stores/annotation-store';

/** Shape returned by GET /sessions/:id/annotations — a raw Annotation row. */
interface RawAnnotation {
  id: string;
  frameTimestampMs: number;
  type: string;
  geometry: any;
  textContent: string | null;
  color: string | null;
  thickness: number;
  persistUntilCleared: boolean;
  createdBy: string;
  createdAt: string;
}

function toClientAnnotation(raw: RawAnnotation): ClientAnnotation {
  return {
    id: raw.id,
    type: raw.type as ClientAnnotation['type'],
    frameTimestampMs: raw.frameTimestampMs,
    geometry: raw.geometry,
    thickness: raw.thickness,
    createdBy: raw.createdBy,
    createdAt: raw.createdAt,
    persistUntilCleared: raw.persistUntilCleared,
    ...(raw.color ? { color: raw.color } : {}),
    ...(raw.textContent ? { textContent: raw.textContent } : {}),
  };
}

export function useAnnotationSocket(sessionId: string) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation);
  const undoLastAnnotation = useAnnotationStore((s) => s.undoLastAnnotation);
  const clearAnnotations = useAnnotationStore((s) => s.clearAnnotations);
  const setAnnotations = useAnnotationStore((s) => s.setAnnotations);

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
    const handleDraw = (payload: ClientAnnotation) => {
      addAnnotation(payload);
    };

    const handleUndo = (payload: { frameTimestampMs: number }) => {
      undoLastAnnotation(payload.frameTimestampMs);
    };

    const handleClear = (payload: { frameTimestampMs: number }) => {
      clearAnnotations(payload.frameTimestampMs);
    };

    const handleDelete = (payload: { id: string }) => {
      removeAnnotation(payload.id);
    };

    socket.on('annotation:draw', handleDraw);
    socket.on('annotation:undo', handleUndo);
    socket.on('annotation:clear', handleClear);
    socket.on('annotation:delete', handleDelete);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('annotation:draw', handleDraw);
      socket.off('annotation:undo', handleUndo);
      socket.off('annotation:clear', handleClear);
      socket.off('annotation:delete', handleDelete);
    };
  }, [accessToken, sessionId, addAnnotation, removeAnnotation, undoLastAnnotation, clearAnnotations]);

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

  const deleteAnnotation = (id: string, studentIds?: string[]) => {
    socket.emit('annotation:delete', {
      sessionId,
      id,
      studentIds,
    });
  };

  /** Pulls the durably-persisted annotation state for this session — call
   * when replay opens (fresh join, reconnect, or a coach who just started a
   * new instant replay) so a participant who wasn't there when a shape was
   * first drawn still sees it, instead of starting from an empty canvas. */
  const syncAnnotations = useCallback(async () => {
    try {
      const rows = await apiClient.get<RawAnnotation[]>(`/sessions/${sessionId}/annotations`);
      // Tombstones are kept (not filtered out here) — getVisibleAnnotations
      // needs them in-order to know which momentary marks were cleared on a
      // given frame, exactly like it does for live-drawn ones.
      setAnnotations(rows.map(toClientAnnotation));
    } catch (err) {
      console.error('[useAnnotationSocket] Failed to sync annotation history:', err);
    }
  }, [sessionId, setAnnotations]);

  return {
    drawAnnotation,
    undoAnnotation,
    clearAnnotationLayer,
    deleteAnnotation,
    syncAnnotations,
  };
}
