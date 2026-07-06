import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Session } from '../../sessions/session.entity';
import { User } from '../../users/user.entity';

// 1. Recording Entity
@Entity('recordings')
@Index('IDX_recordings_session_participant', ['sessionId', 'participantId'])
@Index('IDX_recordings_egress_id', ['egressId'], { unique: true })
export class Recording {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'participant_id', type: 'uuid', nullable: true })
  participantId!: string | null;

  @Column({ name: 'track_type', type: 'varchar', length: 20 })
  trackType!: string;

  @Column({ name: 'egress_id', type: 'varchar', length: 100 })
  egressId!: string;

  @Column({ name: 's3_key_prefix', type: 'varchar', length: 512 })
  s3KeyPrefix!: string;

  @Column({ type: 'varchar', length: 50, default: 'recording' })
  status!: string;

  @Column({ name: 'duration_seconds', type: 'int', default: 0 })
  durationSeconds!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: Session;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'participant_id' })
  participant!: User | null;
}

// 2. PoseKeypointFrame Entity
@Entity('pose_keypoint_frames')
@Index('IDX_pose_frames', ['recordingId', 'frameTimestampMs'])
export class PoseKeypointFrame {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'recording_id', type: 'uuid' })
  recordingId!: string;

  @Column({ name: 'frame_timestamp_ms', type: 'int' })
  frameTimestampMs!: number;

  @Column({ type: 'jsonb' })
  keypoints!: Record<string, any>;

  @Column({ name: 'confidence_avg', type: 'double precision' })
  confidenceAvg!: number;

  @ManyToOne(() => Recording, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recording_id' })
  recording!: Recording;
}

// 3. ReplayEvent Entity
@Entity('replay_events')
export class ReplayEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'initiated_by', type: 'uuid' })
  initiatedBy!: string;

  @Column({ name: 'target_participant_id', type: 'uuid', nullable: true })
  targetParticipantId!: string | null;

  @Column({ name: 'seek_timestamp_ms', type: 'int' })
  seekTimestampMs!: number;

  @Column({ name: 'shared_with_user_ids', type: 'jsonb', default: '[]' })
  sharedWithUserIds!: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: Session;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'initiated_by' })
  initiator!: User;
}

// 4. Clip Entity
@Entity('clips')
export class Clip {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'start_ms', type: 'int' })
  startMs!: number;

  @Column({ name: 'end_ms', type: 'int' })
  endMs!: number;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 's3_key', type: 'varchar', length: 512 })
  s3Key!: string;

  /**
   * 'recording' (default): s3Key is an HLS manifest, signed via CloudFront.
   * 'reference': s3Key is a ReferenceVideo's own storage key (a plain MP4,
   * signed via ReferenceStorageService) — see ReferenceService.createClipForVideo().
   */
  @Column({ name: 'clip_type', type: 'varchar', length: 20, default: 'recording' })
  clipType!: 'recording' | 'reference';

  @Column({ name: 'reference_video_id', type: 'uuid', nullable: true })
  referenceVideoId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: Session;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator!: User;
}

// 5. Annotation Entity
@Entity('annotations')
export class Annotation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'clip_id', type: 'uuid', nullable: true })
  clipId!: string | null;

  @Column({ name: 'replay_event_id', type: 'uuid', nullable: true })
  replayEventId!: string | null;

  @Column({ name: 'frame_timestamp_ms', type: 'int' })
  frameTimestampMs!: number;

  @Column({ type: 'varchar', length: 50 })
  type!: string;

  @Column({ type: 'jsonb' })
  geometry!: Record<string, any>;

  @Column({ name: 'text_content', type: 'text', nullable: true })
  textContent!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Clip, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'clip_id' })
  clip!: Clip | null;

  @ManyToOne(() => ReplayEvent, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'replay_event_id' })
  replayEvent!: ReplayEvent | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator!: User;
}

// 6. ClipShare Entity
@Entity('clip_shares')
export class ClipShare {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'clip_id', type: 'uuid' })
  clipId!: string;

  @Column({ name: 'shared_with_user_id', type: 'uuid' })
  sharedWithUserId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Clip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clip_id' })
  clip!: Clip;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shared_with_user_id' })
  recipient!: User;
}

// 7. Subscription Entity
@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'org_id', type: 'uuid' })
  orgId!: string;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 255 })
  stripeCustomerId!: string;

  @Column({ type: 'varchar', length: 100 })
  plan!: string;

  @Column({ name: 'seat_count', type: 'int', default: 1 })
  seatCount!: number;

  @Column({ name: 'current_period_end', type: 'timestamptz' })
  currentPeriodEnd!: Date;
}

// 9. ReferenceVideo Entity — coach-loaded external analysis clip (not a session participant track)
@Entity('reference_videos')
@Index('IDX_reference_videos_session', ['sessionId'])
export class ReferenceVideo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid' })
  uploadedByUserId!: string;

  @Column({ name: 'video_key', type: 'varchar', length: 1024 })
  videoKey!: string;

  @Column({ name: 'keypoints_key', type: 'varchar', length: 1024, nullable: true })
  keypointsKey!: string | null;

  @Column({ type: 'double precision', nullable: true })
  fps!: number | null;

  @Column({ name: 'frame_count', type: 'int', nullable: true })
  frameCount!: number | null;

  @Column({ type: 'int', nullable: true })
  width!: number | null;

  @Column({ type: 'int', nullable: true })
  height!: number | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs!: number | null;

  @Column({ type: 'varchar', length: 20, default: 'uploading' })
  status!: 'uploading' | 'processing' | 'ready' | 'failed';

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: Session;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedBy!: User;
}

// 10. AuditLog Entity
@Entity('audit_logs')
@Index('IDX_audit_logs_actor_time', ['actorUserId', 'createdAt'])
@Index('IDX_audit_logs_resource', ['resourceType', 'resourceId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 100 })
  resourceType!: string;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, any>;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actor!: User | null;
}
