/**
 * Joint-attached annotation contracts — the new primary coaching feature.
 *
 * Unlike the legacy pixel/per-frame Annotation, a tracked annotation stores
 * WHICH joints it connects (by keypoint name), never screen coordinates. At
 * playback each frame resolves the joints' current positions from the
 * keypoints JSON, so the annotation follows the body with no re-inference and
 * no optical/pixel tracking.
 */

/** Shape an annotation draws between (or on) its joint(s). */
export type TrackedAnnotationShape = 'line' | 'arrow' | 'angle' | 'point';

export interface TrackedAnnotation {
  id: string;
  referenceVideoId: string;
  shapeType: TrackedAnnotationShape;
  /** Keypoint name the annotation starts at (e.g. "left_shoulder"). */
  startJoint: string;
  /** Keypoint name it ends at; null for a single-joint marker (point). For
   * 'angle' this is the vertex's far joint; midJoint is the vertex. */
  endJoint: string | null;
  /** Vertex joint for an 'angle' annotation (start–mid–end); null otherwise. */
  midJoint: string | null;
  color: string;
  thickness: number;
  label: string | null;
  /** First frame index the annotation is visible from. */
  fromFrame: number;
  /** Last frame index it's visible until; null = to the end of the video. */
  untilFrame: number | null;
  createdBy: string;
  createdAt: string;
}

/** Payload to create a tracked annotation. */
export interface CreateTrackedAnnotationDto {
  shapeType: TrackedAnnotationShape;
  startJoint: string;
  endJoint?: string | null;
  midJoint?: string | null;
  color: string;
  thickness: number;
  label?: string | null;
  fromFrame: number;
  untilFrame?: number | null;
}

/** Payload to update editable fields of a tracked annotation. */
export interface UpdateTrackedAnnotationDto {
  color?: string;
  thickness?: number;
  label?: string | null;
  untilFrame?: number | null;
}
