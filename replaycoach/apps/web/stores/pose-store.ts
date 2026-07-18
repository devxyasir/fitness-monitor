import { create } from 'zustand';
import type { PoseFrameDto } from '@replaycoach/types';

/**
 * Two independent slots, not one. Previously a single `frames[participantId]`
 * slot was written by BOTH the live real-time socket feed (usePoseOverlay,
 * always running even while a replay is open — the live camera keeps going
 * in the background) AND the replay's own historical pose lookup
 * (ReplayPanel's syncPose). Whichever wrote last won, so a joint-attached
 * annotation's resolved position jumped unpredictably between "where the
 * body is right now" and "where it was at the replayed timestamp" on every
 * socket tick — this is what read as annotation lines "flexing"/drifting
 * during replay playback. Live and replay data can now never collide.
 */
interface PoseState {
  live: Record<string, PoseFrameDto>;
  replay: Record<string, PoseFrameDto>;

  updateLiveFrame: (participantId: string, frame: PoseFrameDto) => void;
  clearLiveParticipant: (participantId: string) => void;
  clearAllLive: () => void;

  updateReplayFrame: (participantId: string, frame: PoseFrameDto) => void;
  clearReplayParticipant: (participantId: string) => void;
  clearAllReplay: () => void;
}

export const usePoseStore = create<PoseState>((set) => ({
  live: {},
  replay: {},

  updateLiveFrame: (participantId, frame) =>
    set((state) => ({
      live: { ...state.live, [participantId]: frame },
    })),

  clearLiveParticipant: (participantId) =>
    set((state) => {
      const next = { ...state.live };
      delete next[participantId];
      return { live: next };
    }),

  clearAllLive: () => set({ live: {} }),

  updateReplayFrame: (participantId, frame) =>
    set((state) => ({
      replay: { ...state.replay, [participantId]: frame },
    })),

  clearReplayParticipant: (participantId) =>
    set((state) => {
      const next = { ...state.replay };
      delete next[participantId];
      return { replay: next };
    }),

  clearAllReplay: () => set({ replay: {} }),
}));
