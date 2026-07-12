import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../users/user.entity';

/**
 * One row per refresh token (active or recently rotated).
 * On rotation, the old row is stamped with `rotatedAt` (soft delete) + a new row is
 * inserted in the same familyId; this keeps a short-lived trace so a duplicate
 * presentation of the just-rotated token within the grace window can be resolved
 * instead of treated as reuse. Rows with `rotatedAt` set are purged after a
 * retention buffer (see RefreshTokenService.purgeExpired).
 * On reuse detection (a token presented outside the grace window), all rows with
 * the same familyId are deleted.
 * See 06_Authentication_Authorization_RBAC.md §7.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  /**
   * Groups tokens issued from the same login event.
   * All tokens in a family are revoked together on theft detection.
   */
  @Index()
  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  /**
   * Argon2id hash of the raw token — we never store the raw token. This is
   * the actual proof-of-possession check (single verify against the row
   * found via tokenLookupHash, not a scan).
   */
  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash!: string;

  /**
   * SHA-256 hex digest of the raw token, indexed for O(1) lookup. Not a
   * security downgrade: the raw token is a 122-bit random UUID, not a
   * password, so a fast non-secret index doesn't expose it to brute force
   * (reversing SHA-256 of a random UUID is as infeasible as reversing
   * argon2 of one — the search space is what protects it, not hash speed).
   */
  @Index({ unique: true })
  @Column({ name: 'token_lookup_hash', type: 'varchar', length: 64 })
  tokenLookupHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  /**
   * Whether this token's family should renew on the long ("remember me")
   * TTL vs the short session TTL on each rotation — set once at login/register
   * and carried forward by RefreshTokenService.rotate() so the client can't
   * silently escalate a session-only login into a persistent one.
   */
  @Column({ name: 'remember_me', type: 'boolean', default: false })
  rememberMe!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  /**
   * Set when this token is rotated out. NULL means still active.
   * Kept briefly (see purgeExpired) so a same-token duplicate presented within the
   * grace window can be resolved instead of triggering reuse detection.
   */
  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt!: Date | null;

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
