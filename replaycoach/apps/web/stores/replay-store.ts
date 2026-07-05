/**
 * replay-store — Zustand store for DVR replay state.
 * Implementation: Phase 1 (see 08_Recording_Replay_DVR_System.md)
 */
import { create } from 'zustand';

type ReplayMode = 'idle' | 'playing' | 'paused';

interface ReplayState {
  mode: ReplayMode;
  currentTimestamp: number | null;
  playbackRateMultiplier: number;
  manifestUrl: string | null;
  participantId: string | null;
  getReplayBlob: ((participantId: string, fromOffsetMs: number, toOffsetMs?: number) => Blob | null) | null;
  // Actions
  setMode: (mode: ReplayMode) => void;
  setTimestamp: (ts: number) => void;
  setManifestUrl: (url: string | null) => void;
  setParticipantId: (id: string | null) => void;
  setGetReplayBlob: (
    fn: ((participantId: string, fromOffsetMs: number, toOffsetMs?: number) => Blob | null) | null,
  ) => void;
  setPlaybackRate: (rate: number) => void;
  reset: () => void;
}

export const useReplayStore = create<ReplayState>((set) => ({
  mode: 'idle',
  currentTimestamp: null,
  playbackRateMultiplier: 1,
  manifestUrl: null,
  participantId: null,
  getReplayBlob: null,
  setMode: (mode) => set({ mode }),
  setTimestamp: (ts) => set({ currentTimestamp: ts }),
  setManifestUrl: (url) => set({ manifestUrl: url }),
  setParticipantId: (id) => set({ participantId: id }),
  setGetReplayBlob: (fn) => set({ getReplayBlob: fn }),
  setPlaybackRate: (rate) => set({ playbackRateMultiplier: rate }),
  reset: () =>
    set({
      mode: 'idle',
      currentTimestamp: null,
      manifestUrl: null,
      participantId: null,
    }),
}));

