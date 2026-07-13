import { create } from 'zustand';

/** Drawable shape kinds — what an annotation's `type` can actually be. */
export type AnnotationShape = 'pen' | 'arrow' | 'line' | 'circle' | 'angle' | 'point' | 'text';

/** Toolbar selection — every shape, plus 'select' (a UI mode, never an
 * annotation's own `type`). */
export type AnnotationTool = AnnotationShape | 'select';

/** Which participant's skeleton a shape's endpoint is pinned to, and which
 * named joint on it — resolved against the live pose buffer at render time
 * instead of being fixed pixel coordinates. See AnnotationCanvas.tsx. */
export interface JointRef {
  participantId: string;
  startJoint: string;
  endJoint?: string;
  midJoint?: string;
}

export interface ClientAnnotation {
  /** Always set client-side before broadcast (not left to the DB to
   * generate) so every recipient — including the drawing coach's own
   * optimistic local copy — can de-dupe/reference the same annotation by
   * id. See annotations.service.ts's CreateAnnotationPayload.id. */
  id: string;
  type: AnnotationShape | 'tombstone';
  frameTimestampMs: number;
  geometry: any; // normalized [0,1] coordinates, plus optional jointRef
  color?: string;
  thickness?: number;
  textContent?: string;
  createdBy?: string;
  createdAt?: string;
  /** false (default): visible only at exactly frameTimestampMs (a momentary
   * telestrator mark). true: visible on every frame from frameTimestampMs
   * onward until deleted — used for joint-attached shapes so they track
   * the body through the whole replay instead of flashing once. */
  persistUntilCleared?: boolean;
}

interface AnnotationState {
  activeTool: AnnotationTool;
  activeColor: string;
  activeThickness: number;
  annotations: ClientAnnotation[];
  selectedId: string | null;

  setActiveTool: (tool: AnnotationTool) => void;
  setActiveColor: (color: string) => void;
  setActiveThickness: (thickness: number) => void;
  setAnnotations: (annotations: ClientAnnotation[]) => void;
  addAnnotation: (annotation: ClientAnnotation) => void;
  removeAnnotation: (id: string) => void;
  /** Legacy frame-scoped removal — kept for the "Undo" socket path some
   * older clients may still send; new code should prefer removeAnnotation. */
  undoLastAnnotation: (frameTimestampMs: number, userId?: string) => void;
  clearAnnotations: (frameTimestampMs: number, userId?: string) => void;
  select: (id: string | null) => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  activeTool: 'pen',
  activeColor: '#FF3B30',
  activeThickness: 3,
  annotations: [],
  selectedId: null,

  setActiveTool: (tool) => set({ activeTool: tool }),
  setActiveColor: (color) => set({ activeColor: color }),
  setActiveThickness: (thickness) => set({ activeThickness: thickness }),

  setAnnotations: (annotations) => set({ annotations }),

  addAnnotation: (annotation) =>
    set((state) => {
      // De-dupe by id: the drawing client already appended this optimistically;
      // if the server broadcast (or a late-join sync) also delivers it, don't
      // append a second copy.
      if (state.annotations.some((a) => a.id === annotation.id)) return state;
      return {
        annotations: [...state.annotations, { ...annotation, createdAt: annotation.createdAt || new Date().toISOString() }],
      };
    }),

  removeAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  undoLastAnnotation: (frameTimestampMs, userId) =>
    set((state) => {
      const reverseIndex = [...state.annotations]
        .reverse()
        .findIndex(
          (ann) =>
            ann.frameTimestampMs === frameTimestampMs &&
            ann.type !== 'tombstone' &&
            (!userId || ann.createdBy === userId)
        );

      if (reverseIndex === -1) return {};

      const actualIndex = state.annotations.length - 1 - reverseIndex;
      const newAnnotations = [...state.annotations];
      newAnnotations.splice(actualIndex, 1);

      return { annotations: newAnnotations };
    }),

  clearAnnotations: (frameTimestampMs, userId) =>
    set((state) => {
      const tombstone: ClientAnnotation = {
        id: `tombstone-${frameTimestampMs}-${Date.now()}`,
        type: 'tombstone',
        frameTimestampMs,
        geometry: {},
        createdAt: new Date().toISOString(),
        ...(userId ? { createdBy: userId } : {}),
      };
      return {
        annotations: [
          ...state.annotations,
          tombstone,
        ],
      };
    }),

  select: (id) => set({ selectedId: id }),
}));

/**
 * Visible annotations for the current replay frame:
 *  - Persistent (joint-attached) shapes: visible from their creation frame
 *    onward, unaffected by per-frame tombstones (only individual delete
 *    removes them).
 *  - Momentary shapes: visible only at the exact frame they were drawn on,
 *    and hidden if a tombstone was placed on that same frame afterward.
 */
export function getVisibleAnnotations(annotations: ClientAnnotation[], frameTimestampMs: number): ClientAnnotation[] {
  const persistent = annotations.filter(
    (ann) => ann.persistUntilCleared && ann.type !== 'tombstone' && frameTimestampMs >= ann.frameTimestampMs,
  );

  const frameAnnotations = annotations.filter(
    (ann) => !ann.persistUntilCleared && ann.frameTimestampMs === frameTimestampMs,
  );
  const latestTombstoneIndex = [...frameAnnotations]
    .reverse()
    .findIndex((ann) => ann.type === 'tombstone');

  const momentary =
    latestTombstoneIndex === -1
      ? frameAnnotations.filter((ann) => ann.type !== 'tombstone')
      : frameAnnotations
          .slice(frameAnnotations.length - latestTombstoneIndex)
          .filter((ann) => ann.type !== 'tombstone');

  return [...persistent, ...momentary];
}
