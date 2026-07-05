import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload } from '@replaycoach/types';

const makeContext = (userRole: string, metadataRoles: string[] | undefined) => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(metadataRoles) } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  const request = {
    user: { sub: 'user-uuid', role: userRole } as JwtPayload,
  };

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as import('@nestjs/common').ExecutionContext;

  return { guard, context, reflector };
};

describe('RolesGuard', () => {
  it('should allow access when no @Roles() decorator is set', () => {
    const { guard, context } = makeContext('student', undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when user role matches @Roles()', () => {
    const { guard, context } = makeContext('coach', ['coach']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow platform_admin when @Roles() includes platform_admin', () => {
    const { guard, context } = makeContext('platform_admin', ['platform_admin', 'studio_admin']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when student tries coach-only endpoint', () => {
    const { guard, context } = makeContext('student', ['coach']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when coach lacks studio_admin role', () => {
    const { guard, context } = makeContext('coach', ['studio_admin', 'platform_admin']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should use roles from both handler and class metadata', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();

    const guard = module.get<RolesGuard>(RolesGuard);
    const reflector = module.get<Reflector>(Reflector);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['coach']);

    const request = { user: { role: 'coach' } as JwtPayload };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as import('@nestjs/common').ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
