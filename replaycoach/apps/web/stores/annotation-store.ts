import { create } from 'zustand';

export type AnnotationTool = 'pen' | 'arrow' | 'circle' | 'text';

export interface ClientAnnotation {
  id?: string;
  type: AnnotationTool | 'tombstone';
  frameTimestampMs: number;
  geometry: any; // normalized coordinates in [0, 1]
  color?: string;
  textContent?: string;
  createdBy?: string;
  createdAt?: string; // ISO string from database or local client instantiation
}

interface AnnotationState {
  activeTool: AnnotationTool;
  activeColor: string;
  annotations: ClientAnnotation[];
  undoStack: ClientAnnotation[][]; // for tracking undo/redo history groups if needed
  
  // Actions
  setActiveTool: (tool: AnnotationTool) => void;
  setActiveColor: (color: string) => void;
  setAnnotations: (annotations: ClientAnnotation[]) => void;
  addAnnotation: (annotation: ClientAnnotation) => void;
  undoLastAnnotation: (frameTimestampMs: number, userId?: string) => void;
  clearAnnotations: (frameTimestampMs: number, userId?: string) => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  activeTool: 'pen',
  activeColor: '#FF3B30', // nice vibrant red matching spec
  annotations: [],
  undoStack: [],

  setActiveTool: (tool) => set({ activeTool: tool }),
  setActiveColor: (color) => set({ activeColor: color }),
  
  setAnnotations: (annotations) => set({ annotations }),

  addAnnotation: (annotation) =>
    set((state) => ({
      annotations: [...state.annotations, { ...annotation, createdAt: annotation.createdAt || new Date().toISOString() }],
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
}));

/**
 * Hook/helper selector to fetch current visible annotations for a given frameTimestampMs
 * Filters out annotations created prior to the latest tombstone for that frame.
 */
export function getVisibleAnnotations(annotations: ClientAnnotation[], frameTimestampMs: number): ClientAnnotation[] {
  const frameAnnotations = annotations.filter((ann) => ann.frameTimestampMs === frameTimestampMs);
  
  // Find index of latest tombstone
  const latestTombstoneIndex = [...frameAnnotations]
    .reverse()
    .findIndex((ann) => ann.type === 'tombstone');

  if (latestTombstoneIndex === -1) {
    return frameAnnotations.filter((ann) => ann.type !== 'tombstone');
  }

  const actualTombstoneIndex = frameAnnotations.length - 1 - latestTombstoneIndex;
  // Slice everything after the latest tombstone
  return frameAnnotations
    .slice(actualTombstoneIndex + 1)
    .filter((ann) => ann.type !== 'tombstone');
}
