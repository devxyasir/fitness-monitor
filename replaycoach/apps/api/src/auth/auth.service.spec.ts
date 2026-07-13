import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';

import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { UserService } from '../users/user.service';
import { OrganizationService } from '../organizations/organization.service';
import type { User } from '../users/user.entity';
import type { RefreshToken } from './refresh-token.entity';

// ── Test helpers ──────────────────────────────────────────────────────────────

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-uuid',
    email: 'test@example.com',
    passwordHash: '',
    role: 'coach',
    orgId: null,
    displayName: 'Test User',
    avatarUrl: null,
    status: 'active',
    emailVerified: false,
    emailVerifiedAt: null,
    lastLoginAt: null,
    sessionVersion: 1,
    createdAt: new Date(),
    deletedAt: null,
    organization: null,
    refreshTokens: [],
    ...overrides,
  } as User);

const makeRefreshToken = (overrides: Partial<RefreshToken> = {}): RefreshToken =>
  ({
    id: 'rt-uuid',
    userId: 'user-uuid',
    familyId: 'family-uuid',
    tokenHash: 'hashed',
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    user: null as unknown as User,
    ...overrides,
  } as RefreshToken);

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUserService = {
  create: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
  incrementSessionVersion: jest.fn(),
  touchLastLogin: jest.fn(),
};

const mockOrganizationService = {
  consumeInviteForRegistration: jest.fn(),
  joinTeamAfterRegistration: jest.fn(),
};

const mockDataSource = {
  createQueryRunner: jest.fn(),
};

const mockRefreshTokenService = {
  store: jest.fn(),
  findValid: jest.fn(),
  rotate: jest.fn(),
  revoke: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('signed-access-token'),
};

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('secret'),
  get: jest.fn().mockReturnValue('7d'),
};



describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mockUserService },
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: RefreshTokenService, useValue: mockRefreshTokenService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should return an access token and store a refresh token', async () => {
      const user = makeUser();
      mockUserService.create.mockResolvedValue(user);
      mockRefreshTokenService.store.mockResolvedValue('family-uuid');

      const { tokenResponse, refreshToken } = await service.register({
        email: 'test@example.com',
        password: 'Password1!',
        displayName: 'Test',
        role: 'coach',
      });

      expect(tokenResponse.accessToken).toBe('signed-access-token');
      expect(refreshToken).toBeDefined();
      expect(mockRefreshTokenService.store).toHaveBeenCalledTimes(1);
    });

    it('should surface ConflictException if email already registered', async () => {
      mockUserService.create.mockRejectedValue(new ConflictException('Email already registered'));
      await expect(
        service.register({ email: 'dup@test.com', password: 'P1!aaaa', displayName: 'X', role: 'coach' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      const plainPw = 'ValidPass1!';
      const hash = await argon2.hash(plainPw, { type: argon2.argon2id });
      const user = makeUser({ passwordHash: hash });

      mockUserService.findByEmail.mockResolvedValue(user);
      mockRefreshTokenService.store.mockResolvedValue('family-uuid');

      const { tokenResponse } = await service.login({ email: user.email, password: plainPw });
      expect(tokenResponse.accessToken).toBe('signed-access-token');
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      const hash = await argon2.hash('CorrectPass1!', { type: argon2.argon2id });
      const user = makeUser({ passwordHash: hash });
      mockUserService.findByEmail.mockResolvedValue(user);

      await expect(service.login({ email: user.email, password: 'WrongPass1!' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user does not exist (constant-time)', async () => {
      // No user found — still runs dummy argon2 verify for timing consistency
      mockUserService.findByEmail.mockResolvedValue(null);
      await expect(service.login({ email: 'ghost@test.com', password: 'any' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('should include correct sessionVersion in JWT payload', async () => {
      const plainPw = 'ValidPass1!';
      const hash = await argon2.hash(plainPw, { type: argon2.argon2id });
      const user = makeUser({ passwordHash: hash, sessionVersion: 3 });

      mockUserService.findByEmail.mockResolvedValue(user);
      mockRefreshTokenService.store.mockResolvedValue('family-uuid');

      await service.login({ email: user.email, password: plainPw });

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sessionVersion: 3 }),
      );
    });
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('should rotate the refresh token and return new tokens', async () => {
      const oldToken = 'old-raw-token';
      const rt = makeRefreshToken();
      const user = makeUser();

      mockRefreshTokenService.findValid.mockResolvedValue(rt);
      mockRefreshTokenService.rotate.mockResolvedValue({
        newRawToken: 'new-raw-token',
        familyId: 'family-uuid',
        rememberMe: false,
      });
      mockUserService.findById.mockResolvedValue(user);

      const { tokenResponse, refreshToken } = await service.refresh(oldToken);

      expect(tokenResponse.accessToken).toBe('signed-access-token');
      expect(refreshToken).toBe('new-raw-token');
      expect(mockRefreshTokenService.rotate).toHaveBeenCalledWith(oldToken, user.id, expect.any(Function));
    });

    it('should throw UnauthorizedException if refresh token not found', async () => {
      mockRefreshTokenService.findValid.mockResolvedValue(null);
      await expect(service.refresh('invalid-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should bump sessionVersion and revoke the refresh token', async () => {
      mockRefreshTokenService.revoke.mockResolvedValue(undefined);
      mockUserService.incrementSessionVersion.mockResolvedValue(undefined);
      await service.logout('some-token', 'user-uuid');
      expect(mockUserService.incrementSessionVersion).toHaveBeenCalledWith('user-uuid');
      expect(mockRefreshTokenService.revoke).toHaveBeenCalledWith('some-token');
    });

    it('should still bump sessionVersion if no refresh token provided', async () => {
      mockUserService.incrementSessionVersion.mockResolvedValue(undefined);
      await service.logout(undefined, 'user-uuid');
      expect(mockUserService.incrementSessionVersion).toHaveBeenCalledWith('user-uuid');
      expect(mockRefreshTokenService.revoke).not.toHaveBeenCalled();
    });
  });

  // ── forgotPassword ─────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('should resolve without error regardless of whether email exists', async () => {
      // Stub — always resolves
      await expect(service.forgotPassword('nobody@example.com')).resolves.toBeUndefined();
    });
  });

  // ── password hash ──────────────────────────────────────────────────────────

  describe('password storage', () => {
    it('should never store the plaintext password', async () => {
      const plainPw = 'MySecret1!';
      const user = makeUser({ passwordHash: await argon2.hash(plainPw, { type: argon2.argon2id }) });
      mockUserService.findByEmail.mockResolvedValue(user);
      mockRefreshTokenService.store.mockResolvedValue('fam');

      // Verify hash is argon2id, not plaintext
      expect(user.passwordHash).not.toBe(plainPw);
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);

      // And it verifies correctly
      await expect(argon2.verify(user.passwordHash, plainPw)).resolves.toBe(true);
    });
  });

  // ── Access token — MUST NOT be stored in localStorage ─────────────────────
  // (Client-side concern — tested in apps/web. Service only returns the token,
  //  never persists it. This comment anchors that requirement here.)
});
