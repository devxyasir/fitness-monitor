'use client';

import { useEffect, useRef } from 'react';
import { socket } from '../../../../lib/socket-client';
import { usePoseStore } from '../../../../stores/pose-store';
import type { PoseFrameDto } from '@replaycoach/types';

/**
 * usePoseOverlay — subscribes to `pose:update` socket events and writes
 * keypoints into the Zustand pose store.
 *
 * Graceful degradation: if no events received for 2s per participant,
 * clears that participant's overlay (pose service may be down).
 */
export function usePoseOverlay(sessionId: string) {
  const timeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const { updateFrame, clearParticipant } = usePoseStore();

  useEffect(() => {
    const handlePoseUpdate = (data: PoseFrameDto) => {
      if (data.sessionId !== sessionId) return;

      const { participantId } = data;
      updateFrame(participantId, data);

      // Reset the staleness timeout for this participant
      const existing = timeoutRefs.current[participantId];
      if (existing) {
        clearTimeout(existing);
      }

      timeoutRefs.current[participantId] = setTimeout(() => {
        clearParticipant(participantId);
        delete timeoutRefs.current[participantId];
      }, 2000);
    };

    socket.on('pose:update', handlePoseUpdate);

    return () => {
      socket.off('pose:update', handlePoseUpdate);

      // Clear all timeouts on cleanup
      for (const key of Object.keys(timeoutRefs.current)) {
        const timer = timeoutRefs.current[key];
        if (timer) clearTimeout(timer);
      }
      timeoutRefs.current = {};
    };
  }, [sessionId, updateFrame, clearParticipant]);
}
