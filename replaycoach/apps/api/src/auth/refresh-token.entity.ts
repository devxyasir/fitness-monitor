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
 * One row per active refresh token.
 * On rotation, old row deleted + new row inserted (same familyId).
 * On reuse detection, all rows with same familyId are deleted.
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
   * Argon2id hash of the raw token — we never store the raw token.
   */
  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
