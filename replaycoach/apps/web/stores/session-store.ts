/**
 * session-store — Zustand store for live session state.
 * Updated by socket event handlers; components subscribe via selectors.
 * See 13_Frontend_Architecture.md §2 and §4.
 * Implementation: Phase 1.
 */
import { create } from 'zustand';

import type { SessionId, UserId } from '@replaycoach/types';

interface SessionState {
  sessionId: SessionId | null;
  participantIds: UserId[];
  isConnected: boolean;
  // Actions
  setSessionId: (id: SessionId) => void;
  setParticipants: (ids: UserId[]) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  participantIds: [],
  isConnected: false,
  setSessionId: (id) => set({ sessionId: id }),
  setParticipants: (ids) => set({ participantIds: ids }),
  setConnected: (connected) => set({ isConnected: connected }),
  reset: () => set({ sessionId: null, participantIds: [], isConnected: false }),
}));
