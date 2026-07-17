import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { OrgBranding, OrgSettings, OrgStatus } from '@replaycoach/types';

import { User } from '../users/user.entity';
import { OrgInvite } from './org-invite.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 50, default: 'free', name: 'plan_tier' })
  planTier!: string;

  /** platform_admin moderation flag — see migration 020's doc comment. */
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: OrgStatus;

  /** Open bag, no fixed schema — see packages/types/src/organization.ts. */
  @Column({ type: 'jsonb', default: {} })
  settings!: OrgSettings;

  @Column({ type: 'jsonb', default: {} })
  branding!: OrgBranding;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => User, (user) => user.organization)
  users!: User[];

  @OneToMany(() => OrgInvite, (invite) => invite.organization)
  invites!: OrgInvite[];
}
