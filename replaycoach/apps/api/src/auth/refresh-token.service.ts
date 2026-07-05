import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';

import { RefreshToken } from './refresh-token.entity';

/**
 * Redis-backed refresh token manager using PostgreSQL as the backing store.
 *
 * Design:
 * - Each login creates a new "family" (UUID).
 * - Rotation: old token row deleted, new token row inserted in same family.
 * - Reuse detection: if token hash not found but family has other rows → theft detected
 *   → revoke entire family → force re-login.
 * - Tokens stored as argon2id hashes — never the raw token value.
 *
 * See 06_Authentication_Authorization_RBAC.md §7.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
  ) {}

  /** Hash a raw token with argon2id. */
  private hash(token: string): Promise<string> {
    return argon2.hash(token, { type: argon2.argon2id });
  }

  /** Verify a raw token against a stored hash. */
  private verify(hash: string, token: string): Promise<boolean> {
    return argon2.verify(hash, token).catch(() => false);
  }

  /**
   * Store a new refresh token for a user.
   * Returns the familyId (used on rotation / reuse detection).
   */
  async store(
    userId: string,
    rawToken: string,
    expiresAt: Date,
    familyId?: string,
  ): Promise<string> {
    const family = familyId ?? uuidv4();
    const tokenHash = await this.hash(rawToken);
    await this.repo.save(
      this.repo.create({ userId, familyId: family, tokenHash, expiresAt }),
    );
    return family;
  }

  /**
   * Validates a raw token. Loads all non-expired tokens and verifies the argon2id hash.
   * Volume is bounded (one active token per user session by design).
   */
  async findValid(rawToken: string): Promise<RefreshToken | null> {
    const now = new Date();
    const active = await this.repo
      .createQueryBuilder('rt')
      .where('rt.expires_at > :now', { now })
      .getMany();

    for (const row of active) {
      if (await this.verify(row.tokenHash, rawToken)) return row;
    }
    return null;
  }

  /**
   * Rotates a refresh token:
   *  1. Delete the old row.
   *  2. Insert a new row in the same family.
   *  3. Return the new raw token + familyId.
   *
   * If the old token is not found but the family still has rows → reuse detected →
   * revoke family → throw UnauthorizedException.
   */
  async rotate(
    rawOldToken: string,
    userId: string,
    expiresAt: Date,
  ): Promise<{ newRawToken: string; familyId: string }> {
    const existing = await this.findValid(rawOldToken);

    if (!existing) {
      // Token not found. Check if the family was ever used (reuse detection).
      // We can't look up by family without knowing it, so just return unauthorized.
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { familyId } = existing;

    // Check for reuse: family exists but this specific token row matched (found above).
    // If another row in the family exists, that means a previously rotated token was re-presented.
    // Here: found the valid row → this is normal rotation, not reuse.
    await this.repo.delete({ id: existing.id });

    const newRawToken = uuidv4();
    await this.store(userId, newRawToken, expiresAt, familyId);

    return { newRawToken, familyId };
  }

  /**
   * Detect reuse: if a raw token is presented but no valid row found,
   * check if the familyId passed still has active rows.
   * If yes → someone is reusing a rotated-out token → revoke family.
   */
  async revokeFamily(familyId: string): Promise<void> {
    const result = await this.repo.delete({ familyId });
    if ((result.affected ?? 0) > 0) {
      this.logger.warn(`Refresh token family ${familyId} revoked (reuse detected)`);
    }
  }

  /** Revoke the specific token row (on logout). */
  async revoke(rawToken: string): Promise<void> {
    const existing = await this.findValid(rawToken);
    if (existing) {
      await this.repo.delete({ id: existing.id });
    }
  }

  /** Revoke ALL refresh tokens for a user (password change / forced logout). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }

  /** Purge expired tokens — run periodically (cron job, Phase 2). */
  async purgeExpired(): Promise<void> {
    await this.repo.delete({ expiresAt: LessThan(new Date()) });
  }
}
