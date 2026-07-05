import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';

import { RefreshToken } from './refresh-token.entity';

/** Duplicate presentation of a just-rotated token within this window is tolerated. */
const ROTATION_GRACE_MS = 10_000;

/** How long a rotated-out row is kept around (for grace-window + revocation evidence). */
const ROTATED_RETENTION_MS = 5 * 60_000;

/**
 * Redis-backed refresh token manager using PostgreSQL as the backing store.
 *
 * Design:
 * - Each login creates a new "family" (UUID).
 * - Rotation: old row is stamped `rotatedAt` (soft delete), new row inserted in same family.
 * - Grace window: a duplicate presentation of the just-rotated token within
 *   ROTATION_GRACE_MS re-rotates the family's current active token instead of failing —
 *   this absorbs concurrent double-refresh (StrictMode, multi-tab) without weakening
 *   reuse detection for anything older.
 * - Reuse detection: if a rotated-out token is presented outside the grace window →
 *   theft detected → revoke entire family → force re-login.
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
   * Validates a raw token. Loads all active (non-expired, non-rotated) tokens and
   * verifies the argon2id hash. Volume is bounded (one active token per user session
   * by design).
   */
  async findValid(rawToken: string): Promise<RefreshToken | null> {
    const now = new Date();
    const active = await this.repo
      .createQueryBuilder('rt')
      .where('rt.expires_at > :now', { now })
      .andWhere('rt.rotated_at IS NULL')
      .getMany();

    for (const row of active) {
      if (await this.verify(row.tokenHash, rawToken)) return row;
    }
    return null;
  }

  /** The current active (non-rotated) row for a family, if any. */
  private async findActiveByFamily(familyId: string): Promise<RefreshToken | null> {
    const now = new Date();
    return this.repo
      .createQueryBuilder('rt')
      .where('rt.family_id = :familyId', { familyId })
      .andWhere('rt.rotated_at IS NULL')
      .andWhere('rt.expires_at > :now', { now })
      .getOne();
  }

  /** A rotated-out row (within the retention buffer) matching this raw token, if any. */
  private async findRotatedMatch(rawToken: string): Promise<RefreshToken | null> {
    const cutoff = new Date(Date.now() - ROTATED_RETENTION_MS);
    const rotated = await this.repo
      .createQueryBuilder('rt')
      .where('rt.rotated_at IS NOT NULL')
      .andWhere('rt.rotated_at > :cutoff', { cutoff })
      .getMany();

    for (const row of rotated) {
      if (await this.verify(row.tokenHash, rawToken)) return row;
    }
    return null;
  }

  /**
   * Rotates a refresh token:
   *  1. Soft-delete the old row (stamp `rotatedAt`) — kept briefly for grace-window lookups.
   *  2. Insert a new row in the same family.
   *  3. Return the new raw token + familyId.
   *
   * If the old token is not found among active rows, it may be a duplicate presentation
   * of a token that was *just* rotated out (StrictMode double-effect, multi-tab reload):
   *  - Within ROTATION_GRACE_MS of its rotation → re-rotate the family's current active
   *    token and hand back a fresh pair, rather than failing.
   *  - Older than that → genuine reuse of a rotated-out token → revoke the family.
   */
  async rotate(
    rawOldToken: string,
    userId: string,
    expiresAt: Date,
  ): Promise<{ newRawToken: string; familyId: string }> {
    const existing = await this.findValid(rawOldToken);

    if (!existing) {
      const rotatedMatch = await this.findRotatedMatch(rawOldToken);

      if (rotatedMatch) {
        const rotatedAt = rotatedMatch.rotatedAt?.getTime() ?? 0;
        const withinGrace = Date.now() - rotatedAt < ROTATION_GRACE_MS;

        if (withinGrace) {
          const active = await this.findActiveByFamily(rotatedMatch.familyId);
          if (active) {
            this.logger.debug(
              `Refresh token grace-window hit for family ${rotatedMatch.familyId}; re-rotating`,
            );
            await this.repo.update({ id: active.id }, { rotatedAt: new Date() });
            const newRawToken = uuidv4();
            await this.store(userId, newRawToken, expiresAt, rotatedMatch.familyId);
            return { newRawToken, familyId: rotatedMatch.familyId };
          }
        } else {
          // Outside the grace window: genuine reuse of an old rotated-out token.
          await this.revokeFamily(rotatedMatch.familyId);
        }
      }

      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { familyId } = existing;

    await this.repo.update({ id: existing.id }, { rotatedAt: new Date() });

    const newRawToken = uuidv4();
    await this.store(userId, newRawToken, expiresAt, familyId);

    return { newRawToken, familyId };
  }

  /** Revoke every row (active or rotated-out) in a family — the theft-response action. */
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

  /** Purge expired and old rotated-out tokens — run periodically (cron job, Phase 2). */
  async purgeExpired(): Promise<void> {
    await this.repo.delete({ expiresAt: LessThan(new Date()) });

    const rotatedCutoff = new Date(Date.now() - ROTATED_RETENTION_MS);
    await this.repo
      .createQueryBuilder()
      .delete()
      .where('rotated_at IS NOT NULL')
      .andWhere('rotated_at < :rotatedCutoff', { rotatedCutoff })
      .execute();
  }
}
