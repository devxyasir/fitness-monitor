'use client';

import { useEffect } from 'react';
import { socket } from '../../../../lib/socket-client';
import { useReferenceStore, type Stroke } from '../../../../stores/reference-store';

interface ReferenceOpenPayload {
  id: string;
  videoUrl: string;
  overlayVideoUrl: string | null;
  keypointsUrl: string | null;
  fps: number;
  frameCount: number;
  status: 'processing' | 'ready' | 'failed';
  /** Full Body Analysis handles this hook; annotation_tracking is handled by
   * useAnnotationTrackingSocket, so those opens are ignored here. */
  analysisMode?: 'full_body' | 'annotation_tracking';
}

/**
 * Wires the reference-video-analysis socket LISTENERS (mirrors useReplaySocket
 * / useAnnotationSocket). Mount this exactly ONCE per session page — it must
 * keep listening even while the modal is closed (to catch `reference:open`),
 * but must NOT also be mounted again inside the modal itself, or every
 * incoming stroke/undo/clear event gets applied twice (once per listener
 * registration). The modal only needs useReferenceEmitters below.
 */
export function useReferenceSocketListeners(sessionId: string) {
  const open = useReferenceStore((s) => s.open);
  const setReady = useReferenceStore((s) => s.setReady);
  const setPlaying = useReferenceStore((s) => s.setPlaying);
  const setFrameIndex = useReferenceStore((s) => s.setFrameIndex);
  const applyRemoteStroke = useReferenceStore((s) => s.applyRemoteStroke);
  const applyRemoteUndo = useReferenceStore((s) => s.applyRemoteUndo);
  const applyRemoteClear = useReferenceStore((s) => s.applyRemoteClear);
  const close = useReferenceStore((s) => s.close);

  useEffect(() => {
    const handleOpen = (payload: ReferenceOpenPayload) => {
      if (payload.analysisMode === 'annotation_tracking') return;
      open({
        refId: payload.id,
        videoUrl: payload.videoUrl,
        overlayVideoUrl: payload.overlayVideoUrl,
        keypointsUrl: payload.keypointsUrl,
        fps: payload.fps,
        frameCount: payload.frameCount,
        status: payload.status,
      });
    };

    const handleReady = (payload: ReferenceOpenPayload) => {
      if (payload.analysisMode === 'annotation_tracking') return;
      // If the modal is already open (the common case — the coach presents
      // the video immediately after upload, while it's still processing),
      // we must carry overlayVideoUrl/keypointsUrl/fps/frameCount too, not
      // just the status, or the modal keeps playing the raw video.
      // Otherwise treat it like a fresh open.
      if (useReferenceStore.getState().isOpen) {
        setReady({
          overlayVideoUrl: payload.overlayVideoUrl,
          keypointsUrl: payload.keypointsUrl,
          fps: payload.fps,
          frameCount: payload.frameCount,
        });
      } else {
        handleOpen(payload);
      }
    };

    const handleState = (payload: { playing: boolean; frameIndex: number }) => {
      setPlaying(payload.playing);
      setFrameIndex(payload.frameIndex);
    };

    const handleAnnotate = (payload: { frameIndex: number; stroke: Stroke }) => {
      applyRemoteStroke(payload.frameIndex, payload.stroke);
    };

    const handleUndo = (payload: { frameIndex: number }) => {
      applyRemoteUndo(payload.frameIndex);
    };

    const handleClear = (payload: { frameIndex?: number }) => {
      applyRemoteClear(payload.frameIndex);
    };

    const handleClose = () => {
      close();
    };

    socket.on('reference:open', handleOpen);
    socket.on('reference:ready', handleReady);
    socket.on('reference:state', handleState);
    socket.on('reference:annotate', handleAnnotate);
    socket.on('reference:undo', handleUndo);
    socket.on('reference:clear', handleClear);
    socket.on('reference:close', handleClose);

    return () => {
      socket.off('reference:open', handleOpen);
      socket.off('reference:ready', handleReady);
      socket.off('reference:state', handleState);
      socket.off('reference:annotate', handleAnnotate);
      socket.off('reference:undo', handleUndo);
      socket.off('reference:clear', handleClear);
      socket.off('reference:close', handleClose);
    };
  }, [sessionId, open, setReady, setPlaying, setFrameIndex, applyRemoteStroke, applyRemoteUndo, applyRemoteClear, close]);
}

/**
 * Coach-only emit helpers — pure closures over the socket + store, no
 * listener side effects, so safe to call from the modal (mounted/unmounted
 * repeatedly as it opens/closes) without duplicating event handling.
 */
export function useReferenceEmitters(sessionId: string, isCoach: boolean) {
  const refId = useReferenceStore((s) => s.refId);

  // Every interaction is scoped to the coach's current audience selection
  // ("all" when empty) — same targeting model the annotation system uses.
  const targetIds = (): string[] | undefined => {
    const ids = useReferenceStore.getState().targetStudentIds;
    return ids.length > 0 ? ids : undefined;
  };

  const emitState = (playing: boolean, frameIndex: number) => {
    if (!isCoach) return;
    socket.emit('reference:state', { sessionId, playing, frameIndex, studentIds: targetIds() });
  };

  const emitAnnotate = (frameIndex: number, stroke: Stroke) => {
    if (!isCoach) return;
    socket.emit('reference:annotate', { sessionId, frameIndex, stroke, studentIds: targetIds() });
  };

  const emitUndo = (frameIndex: number) => {
    if (!isCoach) return;
    socket.emit('reference:undo', { sessionId, frameIndex, studentIds: targetIds() });
  };

  const emitClear = (frameIndex?: number) => {
    if (!isCoach) return;
    socket.emit('reference:clear', { sessionId, frameIndex, studentIds: targetIds() });
  };

  const emitClose = () => {
    if (!isCoach) return;
    socket.emit('reference:close', { sessionId, studentIds: targetIds() });
  };

  return { emitState, emitAnnotate, emitUndo, emitClear, emitClose, refId };
}
