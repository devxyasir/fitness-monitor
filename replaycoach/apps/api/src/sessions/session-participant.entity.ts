import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Session } from './session.entity';
import { User } from '../users/user.entity';

@Entity('session_participants')
@Index('UQ_session_participants_session_user', ['sessionId', 'userId'], { unique: true })
export class SessionParticipant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'role_in_session', type: 'varchar', length: 50 })
  roleInSession!: 'coach' | 'student';

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt!: Date;

  @Column({ type: 'varchar', length: 50, default: 'approved' })
  status!: 'pending' | 'approved' | 'rejected';

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt!: Date | null;

  // Relations
  @ManyToOne(() => Session, (session) => session.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: Session;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
