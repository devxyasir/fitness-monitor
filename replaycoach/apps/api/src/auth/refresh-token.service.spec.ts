import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';

import { RefreshTokenService } from './refresh-token.service';
import { RefreshToken } from './refresh-token.entity';

const mockRepo = {
  save: jest.fn(),
  create: jest.fn((v: Partial<RefreshToken>) => v),
  delete: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
};

const buildQueryBuilder = (rows: RefreshToken[]) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(rows),
  getOne: jest.fn().mockResolvedValue(rows[0] ?? null),
  delete: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({}),
});

const lookupHash = (rawToken: string) => createHash('sha256').update(rawToken).digest('hex');

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: getRepositoryToken(RefreshToken), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<RefreshTokenService>(RefreshTokenService);
    jest.clearAllMocks();
  });

  const makeRtRow = async (
    rawToken: string,
    familyId = 'fam-1',
    rotatedAt: Date | null = null,
  ): Promise<RefreshToken> => ({
    id: 'rt-id',
    userId: 'user-1',
    familyId,
    tokenHash: await argon2.hash(rawToken, { type: argon2.argon2id }),
    tokenLookupHash: lookupHash(rawToken),
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    rotatedAt,
    user: null as unknown as import('../users/user.entity').User,
  });

  // ── store ──────────────────────────────────────────────────────────────────

  describe('store', () => {
    it('should hash the raw token before saving', async () => {
      const raw = 'raw-token-123';
      mockRepo.save.mockResolvedValue({});

      await service.store('user-1', raw, new Date(Date.now() + 86400000));

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const saved = mockRepo.save.mock.calls[0][0] as Partial<RefreshToken>;
      // Hash should not equal the raw token
      expect(saved.tokenHash).not.toBe(raw);
      // And it should be an argon2id hash
      expect(saved.tokenHash).toMatch(/^\$argon2id\$/);
      // The fast lookup hash is a plain SHA-256 hex digest of the raw token
      // (not secret — used purely as a DB index, see refresh-token.service.ts).
      expect(saved.tokenLookupHash).toBe(lookupHash(raw));
    });

    it('should use provided familyId or generate a new one', async () => {
      mockRepo.save.mockResolvedValue({});
      const familyId = await service.store('user-1', 'token', new Date(), 'provided-family');
      expect(familyId).toBe('provided-family');
    });
  });

  // ── findValid ──────────────────────────────────────────────────────────────

  describe('findValid', () => {
    it('should return the matching row on valid token (O(1) lookup, not a table scan)', async () => {
      const raw = 'valid-token';
      const rtRow = await makeRtRow(raw);
      mockRepo.findOne.mockResolvedValue(rtRow);

      const result = await service.findValid(raw);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rt-id');
      // Looked up by the fast hash — never a createQueryBuilder scan.
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { tokenLookupHash: lookupHash(raw), rotatedAt: expect.anything() },
      });
      expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return null if no row matches the lookup hash', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.findValid('nonexistent');
      expect(result).toBeNull();
    });

    it('should return null if the row is found but the argon2 hash does not match', async () => {
      // Same lookup hash bucket but a different underlying secret (would only
      // happen on a SHA-256 collision in practice) — argon2 verify still gates it.
      const rtRow = await makeRtRow('the-real-token');
      mockRepo.findOne.mockResolvedValue(rtRow);
      const result = await service.findValid('a-different-token');
      expect(result).toBeNull();
    });
  });

  // ── rotate ─────────────────────────────────────────────────────────────────

  describe('rotate', () => {
    it('should mark old token row as rotated and insert new one', async () => {
      const raw = 'old-token';
      const rtRow = await makeRtRow(raw);
      mockRepo.findOne.mockResolvedValue(rtRow);
      mockRepo.update.mockResolvedValue({ affected: 1 });
      mockRepo.save.mockResolvedValue({});

      const { newRawToken, familyId } = await service.rotate(raw, 'user-1', new Date());

      expect(mockRepo.update).toHaveBeenCalledWith(
        { id: 'rt-id' },
        { rotatedAt: expect.any(Date) },
      );
      expect(newRawToken).toBeDefined();
      expect(familyId).toBe('fam-1');
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException if old token not found and no grace-window match', async () => {
      // findValid → no active match; findRotatedMatch → no rotated match either.
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.rotate('bad-token', 'user-1', new Date())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('new token should be different from old token after rotation', async () => {
      const raw = 'original-token';
      const rtRow = await makeRtRow(raw);
      mockRepo.findOne.mockResolvedValue(rtRow);
      mockRepo.update.mockResolvedValue({ affected: 1 });
      mockRepo.save.mockResolvedValue({});

      const { newRawToken } = await service.rotate(raw, 'user-1', new Date());
      expect(newRawToken).not.toBe(raw);
    });

    it('should re-rotate the active token when the just-rotated token is re-presented within the grace window', async () => {
      const rawOld = 'rotated-out-token';
      const rotatedRow = await makeRtRow(rawOld, 'fam-grace', new Date()); // rotated just now
      const activeRow = await makeRtRow('current-active-token', 'fam-grace');

      mockRepo.findOne
        .mockResolvedValueOnce(null) // findValid: no active match
        .mockResolvedValueOnce(rotatedRow); // findRotatedMatch: hit
      // findActiveByFamily still uses createQueryBuilder().getOne() (unchanged).
      mockRepo.createQueryBuilder.mockReturnValue(buildQueryBuilder([activeRow]));

      mockRepo.update.mockResolvedValue({ affected: 1 });
      mockRepo.save.mockResolvedValue({});

      const { newRawToken, familyId } = await service.rotate(rawOld, 'user-1', new Date());

      expect(familyId).toBe('fam-grace');
      expect(newRawToken).toBeDefined();
      expect(mockRepo.update).toHaveBeenCalledWith(
        { id: activeRow.id },
        { rotatedAt: expect.any(Date) },
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('should revoke the family when a rotated-out token is re-presented outside the grace window', async () => {
      const rawOld = 'stale-rotated-token';
      const staleRotatedAt = new Date(Date.now() - 60_000); // 60s ago, well outside the 10s grace window
      const rotatedRow = await makeRtRow(rawOld, 'fam-stale', staleRotatedAt);

      mockRepo.findOne
        .mockResolvedValueOnce(null) // findValid: no active match
        .mockResolvedValueOnce(rotatedRow); // findRotatedMatch: hit, but stale

      mockRepo.delete.mockResolvedValue({ affected: 2 });

      await expect(service.rotate(rawOld, 'user-1', new Date())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(mockRepo.delete).toHaveBeenCalledWith({ familyId: 'fam-stale' });
    });
  });

  // ── revokeFamily ───────────────────────────────────────────────────────────

  describe('revokeFamily', () => {
    it('should delete all tokens in the family', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 2 });
      await service.revokeFamily('fam-1');
      expect(mockRepo.delete).toHaveBeenCalledWith({ familyId: 'fam-1' });
    });
  });

  // ── purgeExpired ───────────────────────────────────────────────────────────

  describe('purgeExpired', () => {
    it('should delete expired tokens and old rotated-out tokens', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 });
      const qb = buildQueryBuilder([]);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      await service.purgeExpired();

      expect(mockRepo.delete).toHaveBeenCalledWith({ expiresAt: expect.anything() });
      expect(qb.delete).toHaveBeenCalled();
      expect(qb.execute).toHaveBeenCalled();
    });
  });

  // ── reuse detection ────────────────────────────────────────────────────────

  describe('reuse detection scenario', () => {
    /**
     * Scenario: Token A is issued (login). Token A is used → Token B issued.
     * Attacker presents Token A again. findValid should return null (it's now
     * rotated-out, excluded by the `rotated_at IS NULL` filter).
     * Caller (AuthService) should detect this and call revokeFamily.
     *
     * This test validates the token becomes invalid (as an *active* token) after rotation.
     */
    it('rotated-out token should not be found by findValid after rotation', async () => {
      const rawA = 'token-A';
      const rtRowA = await makeRtRow(rawA, 'fam-x');

      // First findValid call (rotation): returns A.
      // Second call (simulating re-presentation of A after rotation): returns null.
      mockRepo.findOne
        .mockResolvedValueOnce(rtRowA)
        .mockResolvedValueOnce(null);

      mockRepo.update.mockResolvedValue({ affected: 1 });
      mockRepo.save.mockResolvedValue({});

      // Rotate A → B
      await service.rotate(rawA, 'user-1', new Date());

      // Now A should not be findable as an active token (it was rotated out)
      const result = await service.findValid(rawA);
      expect(result).toBeNull();
    });
  });
});
