import { create } from 'zustand';

export type ReferenceTool = 'freehand' | 'line' | 'rect' | 'ellipse' | 'arrow';

export interface Stroke {
  tool: ReferenceTool;
  color: string;
  width: number;
  points?: [number, number][]; // freehand — normalized [0,1] coords
  from?: [number, number]; // line/arrow/rect/ellipse — normalized [0,1]
  to?: [number, number];
  /** Ellipse only: `from` is the center and `to` defines the radius, rather
   * than opposite bounding-box corners — set when the coach's stroke was
   * snapped onto a detected joint, so the circle is centered on it. */
  centered?: boolean;
}

export interface ReferenceFrameKeypoints {
  frameIndex: number;
  timestampMs: number;
  keypoints: { name: string; x: number; y: number; score: number }[];
}

export interface ReferenceKeypointsData {
  fps: number;
  frameCount: number;
  width: number;
  height: number;
  frames: ReferenceFrameKeypoints[];
}

export type ReferenceStatus = 'processing' | 'ready' | 'failed';

interface ReferenceState {
  isOpen: boolean;
  refId: string | null;
  videoUrl: string | null;
  keypointsUrl: string | null;
  status: ReferenceStatus;

  fps: number;
  frameCount: number;
  keypointsByFrame: Record<number, ReferenceFrameKeypoints>;
  showSkeleton: boolean;

  playing: boolean;
  frameIndex: number;

  strokesByFrame: Record<number, Stroke[]>;
  redoStackByFrame: Record<number, Stroke[]>;
  activeTool: ReferenceTool;
  activeColor: string;
  activeWidth: number;

  /** Who ongoing state/draw events go to — empty means "everyone in the room". */
  targetStudentIds: string[];
  setTargetStudentIds: (ids: string[]) => void;

  open: (payload: { refId: string; videoUrl: string; keypointsUrl?: string | null; fps: number; frameCount: number; status: ReferenceStatus }) => void;
  setKeypoints: (data: ReferenceKeypointsData) => void;
  setReady: (payload: { keypointsUrl: string | null; fps: number; frameCount: number }) => void;
  close: () => void;
  setPlaying: (playing: boolean) => void;
  setFrameIndex: (frameIndex: number) => void;
  toggleSkeleton: () => void;
  setActiveTool: (tool: ReferenceTool) => void;
  setActiveColor: (color: string) => void;
  setActiveWidth: (width: number) => void;
  addStroke: (frameIndex: number, stroke: Stroke) => void;
  undoFrame: (frameIndex: number) => void;
  clearFrame: (frameIndex?: number) => void;
  applyRemoteStroke: (frameIndex: number, stroke: Stroke) => void;
  applyRemoteUndo: (frameIndex: number) => void;
  applyRemoteClear: (frameIndex?: number) => void;
}

const initial = {
  isOpen: false,
  refId: null as string | null,
  videoUrl: null as string | null,
  keypointsUrl: null as string | null,
  status: 'processing' as ReferenceStatus,
  fps: 30,
  frameCount: 0,
  keypointsByFrame: {} as Record<number, ReferenceFrameKeypoints>,
  showSkeleton: true,
  playing: false,
  frameIndex: 0,
  strokesByFrame: {} as Record<number, Stroke[]>,
  redoStackByFrame: {} as Record<number, Stroke[]>,
  activeTool: 'freehand' as ReferenceTool,
  activeColor: '#F59E0B',
  activeWidth: 3,
  targetStudentIds: [] as string[],
};

export const useReferenceStore = create<ReferenceState>((set, get) => ({
  ...initial,

  setTargetStudentIds: (ids) => set({ targetStudentIds: ids }),

  open: ({ refId, videoUrl, keypointsUrl, fps, frameCount, status }) =>
    set({
      ...initial,
      isOpen: true,
      refId,
      videoUrl,
      keypointsUrl: keypointsUrl ?? null,
      fps,
      frameCount,
      status,
    }),

  setKeypoints: (data) => {
    const map: Record<number, ReferenceFrameKeypoints> = {};
    for (const f of data.frames) map[f.frameIndex] = f;
    set({ keypointsByFrame: map, fps: data.fps || get().fps, frameCount: data.frameCount || get().frameCount });
  },

  // Called when 'reference:ready' arrives for an already-open modal — must
  // carry keypointsUrl/fps/frameCount too, not just flip the status, or the
  // keypoints-fetch effect (gated on `status === 'ready' && keypointsUrl`)
  // never fires and the skeleton never renders even though analysis finished.
  setReady: (payload) =>
    set((s) => ({
      status: 'ready',
      keypointsUrl: payload.keypointsUrl,
      fps: payload.fps || s.fps,
      frameCount: payload.frameCount || s.frameCount,
    })),

  close: () => set({ ...initial }),

  setPlaying: (playing) => set({ playing }),
  setFrameIndex: (frameIndex) => set({ frameIndex: Math.max(0, frameIndex) }),
  toggleSkeleton: () => set((s) => ({ showSkeleton: !s.showSkeleton })),

  setActiveTool: (tool) => set({ activeTool: tool }),
  setActiveColor: (color) => set({ activeColor: color }),
  setActiveWidth: (width) => set({ activeWidth: width }),

  addStroke: (frameIndex, stroke) =>
    set((s) => ({
      strokesByFrame: {
        ...s.strokesByFrame,
        [frameIndex]: [...(s.strokesByFrame[frameIndex] ?? []), stroke],
      },
      redoStackByFrame: { ...s.redoStackByFrame, [frameIndex]: [] },
    })),

  undoFrame: (frameIndex) =>
    set((s) => {
      const arr = s.strokesByFrame[frameIndex] ?? [];
      if (arr.length === 0) return s;
      const popped = arr[arr.length - 1]!;
      const redo = s.redoStackByFrame[frameIndex] ?? [];
      return {
        strokesByFrame: { ...s.strokesByFrame, [frameIndex]: arr.slice(0, -1) },
        redoStackByFrame: { ...s.redoStackByFrame, [frameIndex]: [...redo, popped] },
      };
    }),

  clearFrame: (frameIndex) =>
    set((s) => {
      if (frameIndex === undefined) {
        return { strokesByFrame: {}, redoStackByFrame: {} };
      }
      const next = { ...s.strokesByFrame };
      delete next[frameIndex];
      return { strokesByFrame: next };
    }),

  // Remote (socket-driven) mutations — never emit back out.
  applyRemoteStroke: (frameIndex, stroke) =>
    set((s) => ({
      strokesByFrame: {
        ...s.strokesByFrame,
        [frameIndex]: [...(s.strokesByFrame[frameIndex] ?? []), stroke],
      },
    })),
  applyRemoteUndo: (frameIndex) =>
    get().undoFrame(frameIndex),
  applyRemoteClear: (frameIndex) => get().clearFrame(frameIndex),
}));
