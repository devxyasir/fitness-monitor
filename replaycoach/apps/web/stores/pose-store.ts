import { create } from 'zustand';
import type { PoseFrameDto } from '@replaycoach/types';

interface PoseState {
  /** Latest keypoint frame per participant, keyed by participantId. */
  frames: Record<string, PoseFrameDto>;

  /** Update or insert a participant's latest pose frame. */
  updateFrame: (participantId: string, frame: PoseFrameDto) => void;

  /** Clear pose data for a participant (e.g., on service timeout). */
  clearParticipant: (participantId: string) => void;

  /** Clear all pose data (e.g., on session end). */
  clearAll: () => void;
}

export const usePoseStore = create<PoseState>((set) => ({
  frames: {},

  updateFrame: (participantId, frame) =>
    set((state) => ({
      frames: { ...state.frames, [participantId]: frame },
    })),

  clearParticipant: (participantId) =>
    set((state) => {
      const next = { ...state.frames };
      delete next[participantId];
      return { frames: next };
    }),

  clearAll: () => set({ frames: {} }),
}));
