'use client';

import { useEffect } from 'react';
import { socket } from '../../../../lib/socket-client';
import { apiClient } from '../../../../lib/api-client';
import { useAnnotationTrackingStore } from '../../../../stores/annotation-tracking-store';
import type { TrackedAnnotation } from '@replaycoach/types';

interface RefPayload {
  id: string;
  sessionId: string;
  videoUrl: string;
  keypointsUrl: string | null;
  exportVideoUrl: string | null;
  analysisMode: 'full_body' | 'annotation_tracking';
  keypointFormat: 'coco17' | 'halpe26';
  fps: number | null;
  frameCount: number | null;
  status: 'processing' | 'ready' | 'failed';
}

/**
 * Listeners for the Annotation Tracking feature. Mounted once per session.
 * Only acts on reference videos whose analysisMode === 'annotation_tracking';
 * Full Body Analysis opens are handled by useReferenceSocketListeners.
 */
export function useAnnotationTrackingSocket(sessionId: string) {
  const store = useAnnotationTrackingStore;

  useEffect(() => {
    const open = (p: RefPayload) => {
      if (p.analysisMode !== 'annotation_tracking') return;
      store.getState().open({
        refId: p.id,
        sessionId: p.sessionId,
        videoUrl: p.videoUrl,
        keypointsUrl: p.keypointsUrl,
        exportVideoUrl: p.exportVideoUrl,
        keypointFormat: p.keypointFormat,
        fps: p.fps ?? 30,
        frameCount: p.frameCount ?? 0,
        status: p.status,
      });
    };

    const ready = (p: RefPayload) => {
      if (p.analysisMode !== 'annotation_tracking') return;
      const st = store.getState();
      if (st.isOpen && st.refId === p.id) {
        st.setReady({
          keypointsUrl: p.keypointsUrl,
          keypointFormat: p.keypointFormat,
          fps: p.fps ?? st.fps,
          frameCount: p.frameCount ?? st.frameCount,
        });
      } else {
        open(p);
      }
    };

    const onCreate = (p: { refId: string; annotation: TrackedAnnotation }) => {
      if (store.getState().refId === p.refId) store.getState().applyRemoteCreate(p.annotation);
    };
    const onUpdate = (p: { refId: string; annotation: TrackedAnnotation }) => {
      if (store.getState().refId === p.refId) store.getState().applyRemoteUpdate(p.annotation);
    };
    const onDelete = (p: { refId: string; annotationId: string }) => {
      if (store.getState().refId === p.refId) store.getState().applyRemoteDelete(p.annotationId);
    };
    const onExportReady = async (p: { refId: string }) => {
      const st = store.getState();
      if (st.refId !== p.refId) return;
      // Re-fetch the video to obtain the fresh signed export URL.
      try {
        const v = await apiClient.get<{ exportVideoUrl: string | null }>(`/sessions/${sessionId}/reference/${p.refId}`);
        st.setExportVideoUrl(v.exportVideoUrl);
      } catch (e) {
        console.error('[AnnotationTracking] export-ready refresh failed', e);
      }
    };

    // Previously nothing listened for export failure at all — the
    // pose-service's export job could throw and the coach's "Exporting…"
    // spinner would just spin forever with no error and no way to retry.
    const onExportFailed = (p: { refId: string; reason?: string }) => {
      const st = store.getState();
      if (st.refId !== p.refId) return;
      st.setExportError(p.reason || 'Export failed. Please try again.');
    };

    const onExportProgress = (p: { refId: string; percent: number }) => {
      const st = store.getState();
      if (st.refId !== p.refId) return;
      st.setExportProgress(p.percent);
    };

    socket.on('reference:open', open);
    socket.on('reference:ready', ready);
    socket.on('reference:annotation-create', onCreate);
    socket.on('reference:annotation-update', onUpdate);
    socket.on('reference:annotation-delete', onDelete);
    socket.on('reference:export-ready', onExportReady);
    socket.on('reference:export-failed', onExportFailed);
    socket.on('reference:export-progress', onExportProgress);

    return () => {
      socket.off('reference:open', open);
      socket.off('reference:ready', ready);
      socket.off('reference:annotation-create', onCreate);
      socket.off('reference:annotation-update', onUpdate);
      socket.off('reference:annotation-delete', onDelete);
      socket.off('reference:export-ready', onExportReady);
      socket.off('reference:export-failed', onExportFailed);
      socket.off('reference:export-progress', onExportProgress);
    };
  }, [sessionId, store]);
}
