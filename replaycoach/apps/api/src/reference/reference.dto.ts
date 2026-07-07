import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadReferenceVideoDto {
  /** Direct video URL, used when the coach pastes a link instead of uploading a file. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;
}

/** Mirrors the frontend's Stroke type (stores/reference-store.ts) — kept untyped
 * beyond a plain object since it's opaque JSON round-tripped straight from the
 * client into the Annotation.geometry jsonb column. */
export interface ReferenceStroke {
  tool: 'freehand' | 'line' | 'rect' | 'ellipse' | 'arrow';
  color: string;
  width: number;
  points?: [number, number][];
  from?: [number, number];
  to?: [number, number];
  centered?: boolean;
}

/**
 * Every analyzed reference video is auto-saved as a shared Clip the moment
 * pose detection completes (see ReferenceService.createClipForVideo) — the
 * coach never has to save/share manually. This DTO just carries whatever
 * the coach drew, to sync into that already-created clip's annotations.
 */
export class SyncReferenceAnnotationsDto {
  /** Keyed by frame index (as a string, since it travels through JSON). */
  @IsObject()
  strokesByFrame!: Record<string, ReferenceStroke[]>;
}

export interface ReferenceVideoResponse {
  id: string;
  sessionId: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  videoUrl: string;
  keypointsUrl: string | null;
  /** Skeleton burned directly onto the video by the pose-service — the
   * frontend plays this instead of `videoUrl` once it exists. */
  overlayVideoUrl: string | null;
  fps: number | null;
  frameCount: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  failureReason: string | null;
}
