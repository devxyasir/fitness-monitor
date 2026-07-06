import { IsArray, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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

export class SaveReferenceClipDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  studentIds?: string[];

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
  fps: number | null;
  frameCount: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  failureReason: string | null;
}
