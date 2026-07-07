import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateClipDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsInt()
  @Min(0)
  startMs!: number;

  @IsInt()
  @Min(0)
  endMs!: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  studentIds?: string[];
}

export class ShareClipDto {
  @IsArray()
  @IsUUID('4', { each: true })
  studentIds!: string[];
}

/**
 * Enriched clip list item — carries the meeting context the Clips page needs
 * to group clips by meeting and render a cross-role header (the OTHER
 * participant's first name, never the viewer's own, never an email).
 */
export interface ClipListItem {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  sessionId: string;
  createdBy: string;
  createdAt: string;
  clipType: 'recording' | 'reference';
  /** Signed single-file video URL for a preview thumbnail / direct playback
   * (reference/overlay clips). Null for HLS recording clips. */
  videoUrl: string | null;
  /** True when a single-file video exists to download (reference/overlay
   * clips); recording clips are HLS-segmented and not downloadable as one file. */
  downloadable: boolean;
  /** How many students this clip is shared with — for the coach share button. */
  sharesCount: number;
  meeting: {
    sessionId: string;
    /** ISO timestamp used for the meeting's date + time header. */
    startedAt: string;
    /** First name of the OTHER participant (coach's name for a student
     * viewer, student's name for a coach viewer). Never an email. */
    otherParticipantName: string;
  };
}
