import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { UserRole, UserStatus } from '@replaycoach/types';

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
   * Account lifecycle state, independent of email verification.
   * 'active': normal. 'suspended'/'disabled': admin-moderated lockout —
   * enforced at login, at refresh, and (via sessionVersion) against any
   * already-issued access token. 'pending': reserved for a future
   * not-yet-activated state; nothing in the codebase currently assigns it.
   */
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: UserStatus;

  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified!: boolean;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  /** Captured at login (AuthService.login) — surfaced on the admin security
   * panel and written into audit-log entries. Null until first login after
   * this column was introduced. */
  @Column({ name: 'last_login_ip', type: 'inet', nullable: true })
  lastLoginIp!: string | null;

  /** Optional, self-service TOTP 2FA — a platform_admin can enable it for
   * their own account. Never mandatory-on-login. Secret/backup codes are
   * never exposed past enrollment (UserDto only ever carries `totpEnabled`). */
  @Column({ name: 'totp_secret', type: 'varchar', length: 255, nullable: true })
  totpSecret!: string | null;

  @Column({ name: 'totp_enabled', type: 'boolean', default: false })
  totpEnabled!: boolean;

  @Column({ name: 'totp_backup_codes', type: 'jsonb', nullable: true })
  totpBackupCodes!: string[] | null;

  /**
   * Increment on password change or forced logout.
   * Carried in access JWT; validated against DB value.
   * See 06_Authentication_Authorization_RBAC.md §7.
   */
  @Column({ name: 'session_version', type: 'int', default: 1 })
  sessionVersion!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  /** Soft delete — TypeORM auto-excludes rows with this set from normal
   * find/findOne calls, so a deleted user can no longer look themselves up
   * by email at login etc. without any extra filtering in application code. */
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt!: Date | null;

  @ManyToOne(() => Organization, (org) => org.users, { nullable: true })
  @JoinColumn({ name: 'org_id' })
  organization!: Organization | null;

  @OneToMany(() => RefreshToken, (rt) => rt.user)
  refreshTokens!: RefreshToken[];
}
