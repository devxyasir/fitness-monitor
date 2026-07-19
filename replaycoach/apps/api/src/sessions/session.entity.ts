import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { SessionStatus } from '@replaycoach/types';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import { SessionParticipant } from './session-participant.entity';

@Entity('sessions')
@Index('IDX_sessions_coach_status', ['coachId', 'status'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'coach_id', type: 'uuid' })
  coachId!: string;

  @Column({ name: 'org_id', type: 'uuid', nullable: true })
  orgId!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'scheduled' })
  status!: SessionStatus;

  @Column({ name: 'livekit_room_name', type: 'varchar', length: 255, unique: true })
  livekitRoomName!: string;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ name: 'access_type', type: 'varchar', length: 50, default: 'public' })
  accessType!: 'public' | 'lobby';

  @Column({ name: 'invite_code', type: 'varchar', length: 255, unique: true })
  inviteCode!: string;

  @Column({ name: 'retention_days', type: 'int', default: 90 })
  retentionDays!: number;

  /** Admin content-oversight flag — orthogonal to `status`, blocks normal
   * (non-platform_admin) access at the guard level without disturbing the
   * session lifecycle transition matrix. See SessionsGuard. */
  @Column({ type: 'boolean', default: false })
  hidden!: boolean;

  @Column({ name: 'hidden_reason', type: 'varchar', length: 255, nullable: true })
  hiddenReason!: string | null;

  @Column({ name: 'hidden_by', type: 'uuid', nullable: true })
  hiddenBy!: string | null;

  @Column({ name: 'hidden_at', type: 'timestamptz', nullable: true })
  hiddenAt!: Date | null;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coach_id' })
  coach!: User;

  @ManyToOne(() => Organization, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'org_id' })
  organization!: Organization | null;

  @OneToMany(() => SessionParticipant, (sp) => sp.session)
  participants!: SessionParticipant[];
}
