import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { UserRole } from '@replaycoach/types';

import { Organization } from '../organizations/organization.entity';
import { RefreshToken } from '../auth/refresh-token.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 50 })
  role!: UserRole;

  @Column({ name: 'org_id', nullable: true })
  orgId!: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 255 })
  displayName!: string;

  @Column({ name: 'avatar_url', type: 'varchar', length: 512, nullable: true })
  avatarUrl!: string | null;

  /**
   * Increment on password change or forced logout.
   * Carried in access JWT; validated against DB value.
   * See 06_Authentication_Authorization_RBAC.md §7.
   */
  @Column({ name: 'session_version', type: 'int', default: 1 })
  sessionVersion!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Organization, (org) => org.users, { nullable: true })
  @JoinColumn({ name: 'org_id' })
  organization!: Organization | null;

  @OneToMany(() => RefreshToken, (rt) => rt.user)
  refreshTokens!: RefreshToken[];
}
