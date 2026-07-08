import { create } from 'zustand';
import type { KeypointFormat, TrackedAnnotation, TrackedAnnotationShape } from '@replaycoach/types';

export interface KeypointFrame {
  frameIndex: number;
  timestampMs: number;
  keypoints: { name: string; x: number; y: number; score: number }[];
}

/** A local undo/redo op — create/delete of an annotation. */
type AnnOp =
  | { type: 'create'; annotation: TrackedAnnotation }
  | { type: 'delete'; annotation: TrackedAnnotation };

interface AnnotationTrackingState {
  isOpen: boolean;
  refId: string | null;
  sessionId: string | null;
  videoUrl: string | null;
  keypointsUrl: string | null;
  exportVideoUrl: string | null;
  keypointFormat: KeypointFormat;
  status: 'processing' | 'ready' | 'failed';

  fps: number;
  frameCount: number;
  keypointsByFrame: Record<number, KeypointFrame>;

  annotations: TrackedAnnotation[];
  selectedId: string | null;

  // Active tool config for the next drawn annotation.
  shapeType: TrackedAnnotationShape;
  color: string;
  thickness: number;
  showSkeleton: boolean;

  // In-progress joint picking: joints clicked so far for the pending shape.
  pendingJoints: string[];

  playing: boolean;
  frameIndex: number;

  undoStack: AnnOp[];
  redoStack: AnnOp[];

  open: (p: {
    refId: string;
    sessionId: string;
    videoUrl: string;
    keypointsUrl: string | null;
    exportVideoUrl: string | null;
    keypointFormat: KeypointFormat;
    fps: number;
    frameCount: number;
    status: 'processing' | 'ready' | 'failed';
  }) => void;
  close: () => void;
  setKeypoints: (frames: KeypointFrame[], fps?: number, frameCount?: number) => void;
  setReady: (p: { keypointsUrl: string | null; keypointFormat: KeypointFormat; fps: number; frameCount: number }) => void;
  setExportVideoUrl: (url: string | null) => void;

  setAnnotations: (list: TrackedAnnotation[]) => void;
  applyRemoteCreate: (a: TrackedAnnotation) => void;
  applyRemoteUpdate: (a: TrackedAnnotation) => void;
  applyRemoteDelete: (id: string) => void;
  pushUndo: (op: AnnOp) => void;

  select: (id: string | null) => void;
  setShape: (s: TrackedAnnotationShape) => void;
  setColor: (c: string) => void;
  setThickness: (t: number) => void;
  toggleSkeleton: () => void;
  addPendingJoint: (name: string) => void;
  clearPending: () => void;

  setPlaying: (p: boolean) => void;
  setFrameIndex: (i: number) => void;
}

const initial = {
  isOpen: false,
  refId: null as string | null,
  sessionId: null as string | null,
  videoUrl: null as string | null,
  keypointsUrl: null as string | null,
  exportVideoUrl: null as string | null,
  keypointFormat: 'halpe26' as KeypointFormat,
  status: 'processing' as 'processing' | 'ready' | 'failed',
  fps: 30,
  frameCount: 0,
  keypointsByFrame: {} as Record<number, KeypointFrame>,
  annotations: [] as TrackedAnnotation[],
  selectedId: null as string | null,
  shapeType: 'line' as TrackedAnnotationShape,
  color: '#EF4444',
  thickness: 4,
  showSkeleton: false,
  pendingJoints: [] as string[],
  playing: false,
  frameIndex: 0,
  undoStack: [] as AnnOp[],
  redoStack: [] as AnnOp[],
};

export const useAnnotationTrackingStore = create<AnnotationTrackingState>((set) => ({
  ...initial,

  open: (p) => set({ ...initial, isOpen: true, ...p }),
  close: () => set({ ...initial }),

  setKeypoints: (frames, fps, frameCount) => {
    const map: Record<number, KeypointFrame> = {};
    for (const f of frames) map[f.frameIndex] = f;
    set((s) => ({ keypointsByFrame: map, fps: fps || s.fps, frameCount: frameCount || s.frameCount }));
  },

  setReady: (p) =>
    set((s) => ({
      status: 'ready',
      keypointsUrl: p.keypointsUrl,
      keypointFormat: p.keypointFormat,
      fps: p.fps || s.fps,
      frameCount: p.frameCount || s.frameCount,
    })),
  setExportVideoUrl: (url) => set({ exportVideoUrl: url }),

  setAnnotations: (list) => set({ annotations: list }),
  applyRemoteCreate: (a) =>
    set((s) => (s.annotations.some((x) => x.id === a.id) ? s : { annotations: [...s.annotations, a] })),
  applyRemoteUpdate: (a) =>
    set((s) => ({ annotations: s.annotations.map((x) => (x.id === a.id ? a : x)) })),
  applyRemoteDelete: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((x) => x.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
  pushUndo: (op) => set((s) => ({ undoStack: [...s.undoStack, op], redoStack: [] })),

  select: (id) => set({ selectedId: id }),
  setShape: (shapeType) => set({ shapeType, pendingJoints: [] }),
  setColor: (color) => set({ color }),
  setThickness: (thickness) => set({ thickness }),
  toggleSkeleton: () => set((s) => ({ showSkeleton: !s.showSkeleton })),
  addPendingJoint: (name) => set((s) => ({ pendingJoints: [...s.pendingJoints, name] })),
  clearPending: () => set({ pendingJoints: [] }),

  setPlaying: (playing) => set({ playing }),
  setFrameIndex: (frameIndex) => set({ frameIndex: Math.max(0, frameIndex) }),
}));
