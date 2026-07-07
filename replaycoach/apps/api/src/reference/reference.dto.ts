import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UploadReferenceVideoDto {
  /** Direct video URL, used when the coach pastes a link instead of uploading a file. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  /** 'full_body' (Full Body Analysis, burned overlay) or 'annotation_tracking'
   * (new primary — keypoints only, canvas-rendered skeleton + joint annotations). */
  @IsOptional()
  @IsIn(['full_body', 'annotation_tracking'])
  mode?: 'full_body' | 'annotation_tracking';
}

/** Create a joint-attached (tracked) annotation. */
export class CreateTrackedAnnotationDto {
  @IsIn(['line', 'arrow', 'angle', 'point'])
  shapeType!: 'line' | 'arrow' | 'angle' | 'point';

  @IsString()
  @MaxLength(40)
  startJoint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  endJoint?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  midJoint?: string | null;

  @IsString()
  @MaxLength(20)
  color!: string;

  @IsInt()
  @Min(1)
  thickness!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @IsInt()
  @Min(0)
  fromFrame!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  untilFrame?: number | null;
}

/** Update editable fields of a tracked annotation. */
export class UpdateTrackedAnnotationDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  thickness?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  untilFrame?: number | null;
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
  /** Skeleton burned directly onto the video by the pose-service (Full Body
   * Analysis) — the frontend plays this instead of `videoUrl` once it exists. */
  overlayVideoUrl: string | null;
  /** Rendered export (raw + skeleton + tracked annotations); null until exported. */
  exportVideoUrl: string | null;
  analysisMode: 'full_body' | 'annotation_tracking';
  keypointFormat: 'coco17' | 'halpe26';
  fps: number | null;
  frameCount: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  failureReason: string | null;
}
