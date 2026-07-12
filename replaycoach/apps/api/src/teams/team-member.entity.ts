import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { TeamRole } from '@replaycoach/types';

import { User } from '../users/user.entity';
import { Team } from './team.entity';

@Entity('team_members')
@Index(['teamId', 'userId'], { unique: true })
export class TeamMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'team_id' })
  teamId!: string;

  @Index()
  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 20, default: 'member' })
  role!: TeamRole;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt!: Date;

  @ManyToOne(() => Team, (t) => t.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team!: Team;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
