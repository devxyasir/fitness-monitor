import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

import { JwtStrategy } from './jwt.strategy';
import { UserService } from '../users/user.service';
import type { JwtPayload } from '@replaycoach/types';
import type { User } from '../users/user.entity';

const mockUserService = { findById: jest.fn() };
const mockConfigService = { getOrThrow: jest.fn().mockReturnValue('test-secret') };

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-uuid',
    email: 'test@example.com',
    passwordHash: 'hash',
    role: 'coach',
    orgId: null,
    displayName: 'Test',
    avatarUrl: null,
    sessionVersion: 1,
    createdAt: new Date(),
    organization: null,
    refreshTokens: [],
    ...overrides,
  } as User);

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: UserService, useValue: mockUserService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    jest.clearAllMocks();
  });

  const payload: JwtPayload = {
    sub: 'user-uuid',
    email: 'test@example.com',
    role: 'coach',
    orgId: null,
    sessionVersion: 1,
  };

  it('should return the payload when sessionVersion matches', async () => {
    mockUserService.findById.mockResolvedValue(makeUser({ sessionVersion: 1 }));
    const result = await strategy.validate(payload);
    expect(result).toEqual(payload);
  });

  it('should throw UnauthorizedException when sessionVersion mismatches', async () => {
    // User's sessionVersion was incremented (password change / forced logout)
    mockUserService.findById.mockResolvedValue(makeUser({ sessionVersion: 2 }));
    await expect(strategy.validate({ ...payload, sessionVersion: 1 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('should use the sub from the JWT payload to fetch the user', async () => {
    mockUserService.findById.mockResolvedValue(makeUser());
    await strategy.validate(payload);
    expect(mockUserService.findById).toHaveBeenCalledWith('user-uuid');
  });
});
