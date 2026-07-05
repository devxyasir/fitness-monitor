import { Test } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';

import type { JwtPayload } from '@replaycoach/types';
import { SessionsGuard } from './sessions.guard';
import { SessionsService } from './sessions.service';

describe('SessionsGuard', () => {
  let guard: SessionsGuard;
  let sessionsService: jest.Mocked<SessionsService>;

  const mockSessionsService = {
    findById: jest.fn(),
    isParticipant: jest.fn(),
  };

  const createMockExecutionContext = (
    user: JwtPayload | undefined,
    params: { id?: string },
    method = 'GET',
    path = '/sessions/sess-123',
  ): ExecutionContext => {
    const mockRequest = {
      user,
      params,
      method,
      path,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SessionsGuard,
        {
          provide: SessionsService,
          useValue: mockSessionsService,
        },
      ],
    }).compile();

    guard = module.get<SessionsGuard>(SessionsGuard);
    sessionsService = module.get(SessionsService);

    jest.clearAllMocks();
  });

  it('should throw ForbiddenException if user payload is missing', async () => {
    const context = createMockExecutionContext(undefined, { id: 'sess-1' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('User is not authenticated'),
    );
  });

  it('should return true if no session ID param is present in the route', async () => {
    const user: JwtPayload = { sub: 'user-1', role: 'coach', email: 'c@a.com', sessionVersion: 1, orgId: null };
    const context = createMockExecutionContext(user, {}); // No ID param
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw NotFoundException if the session does not exist in DB', async () => {
    const user: JwtPayload = { sub: 'user-1', role: 'coach', email: 'c@a.com', sessionVersion: 1, orgId: null };
    const context = createMockExecutionContext(user, { id: 'missing-session' });
    sessionsService.findById.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new NotFoundException('Session with ID missing-session not found'),
    );
  });

  it('should allow access to platform_admin', async () => {
    const user: JwtPayload = { sub: 'admin-1', role: 'platform_admin', email: 'a@a.com', sessionVersion: 1, orgId: null };
    const context = createMockExecutionContext(user, { id: 'sess-1' });
    sessionsService.findById.mockResolvedValue({ id: 'sess-1', coachId: 'coach-123' } as any);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow access to the specific coach who owns the session', async () => {
    const user: JwtPayload = { sub: 'coach-123', role: 'coach', email: 'c@a.com', sessionVersion: 1, orgId: null };
    const context = createMockExecutionContext(user, { id: 'sess-1' });
    sessionsService.findById.mockResolvedValue({ id: 'sess-1', coachId: 'coach-123' } as any);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow access to an active student participant of the session', async () => {
    const user: JwtPayload = { sub: 'student-456', role: 'student', email: 's@a.com', sessionVersion: 1, orgId: null };
    const context = createMockExecutionContext(user, { id: 'sess-1' });
    sessionsService.findById.mockResolvedValue({ id: 'sess-1', coachId: 'coach-123' } as any);
    sessionsService.isParticipant.mockResolvedValue(true);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(sessionsService.isParticipant).toHaveBeenCalledWith('sess-1', 'student-456');
  });

  it('should allow studio_admin to view session metadata of session under their organization', async () => {
    const user: JwtPayload = { sub: 'sa-789', role: 'studio_admin', email: 'sa@a.com', orgId: 'org-abc', sessionVersion: 1 };
    const context = createMockExecutionContext(user, { id: 'sess-1' }, 'GET');
    sessionsService.findById.mockResolvedValue({ id: 'sess-1', coachId: 'coach-123', orgId: 'org-abc' } as any);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should prevent studio_admin from modifying/updating a session (non-GET request)', async () => {
    const user: JwtPayload = { sub: 'sa-789', role: 'studio_admin', email: 'sa@a.com', orgId: 'org-abc', sessionVersion: 1 };
    const context = createMockExecutionContext(user, { id: 'sess-1' }, 'PATCH');
    sessionsService.findById.mockResolvedValue({ id: 'sess-1', coachId: 'coach-123', orgId: 'org-abc' } as any);
    sessionsService.isParticipant.mockResolvedValue(false);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('You do not have access to this session'),
    );
  });

  it('should bypass participant check for join calls (POST /join)', async () => {
    const user: JwtPayload = { sub: 'student-456', role: 'student', email: 's@a.com', sessionVersion: 1, orgId: null };
    // Path ends with /join
    const context = createMockExecutionContext(user, { id: 'sess-1' }, 'POST', '/sessions/sess-1/join');
    sessionsService.findById.mockResolvedValue({ id: 'sess-1', coachId: 'coach-123' } as any);
    sessionsService.isParticipant.mockResolvedValue(false); // User is not joining yet

    const result = await guard.canActivate(context);
    expect(result).toBe(true); // Permitted to bypass
  });

  it('should reject access to random student who is not a participant', async () => {
    const user: JwtPayload = { sub: 'student-random', role: 'student', email: 'sr@a.com', sessionVersion: 1, orgId: null };
    const context = createMockExecutionContext(user, { id: 'sess-1' });
    sessionsService.findById.mockResolvedValue({ id: 'sess-1', coachId: 'coach-123' } as any);
    sessionsService.isParticipant.mockResolvedValue(false);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('You do not have access to this session'),
    );
  });

  it('should reject access to another coach who is not the owner/participant', async () => {
    const user: JwtPayload = { sub: 'coach-other', role: 'coach', email: 'co@a.com', sessionVersion: 1, orgId: null };
    const context = createMockExecutionContext(user, { id: 'sess-1' });
    sessionsService.findById.mockResolvedValue({ id: 'sess-1', coachId: 'coach-123' } as any);
    sessionsService.isParticipant.mockResolvedValue(false);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('You do not have access to this session'),
    );
  });
});
