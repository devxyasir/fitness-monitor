import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsNull, Repository } from 'typeorm';

import type { JwtPayload, SessionStatus } from '@replaycoach/types';
import { SessionsService } from './sessions.service';
import { Session } from './session.entity';
import { SessionParticipant } from './session-participant.entity';
import { User } from '../users/user.entity';
import { EgressService } from '../media/egress.service';
import { LiveKitService } from '../media/livekit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PoseServiceClient } from '../pose/pose-service.client';

describe('SessionsService', () => {
  let service: SessionsService;
  let sessionRepo: jest.Mocked<Repository<Session>>;
  let participantRepo: jest.Mocked<Repository<SessionParticipant>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let egressService: jest.Mocked<EgressService>;

  const mockSessionRepo = {
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockParticipantRepo = {
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockUserRepo = {
    count: jest.fn(),
  };

  const mockEgressService = {
    startRoomComposite: jest.fn(),
    startTrackComposite: jest.fn(),
    stopEgress: jest.fn(),
    stopSessionEgress: jest.fn(),
  };

  const mockRealtimeGateway = {
    emitRecordingActive: jest.fn(),
    emitRecordingDegraded: jest.fn(),
  };

  const mockPoseServiceClient = {
    startWorker: jest.fn(),
    stopWorker: jest.fn(),
  };

  const mockLiveKitService = {
    deleteRoom: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SessionsService,
        {
          provide: getRepositoryToken(Session),
          useValue: mockSessionRepo,
        },
        {
          provide: getRepositoryToken(SessionParticipant),
          useValue: mockParticipantRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: EgressService,
          useValue: mockEgressService,
        },
        {
          provide: LiveKitService,
          useValue: mockLiveKitService,
        },
        {
          provide: RealtimeGateway,
          useValue: mockRealtimeGateway,
        },
        {
          provide: PoseServiceClient,
          useValue: mockPoseServiceClient,
        },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
    sessionRepo = module.get(getRepositoryToken(Session));
    participantRepo = module.get(getRepositoryToken(SessionParticipant));
    userRepo = module.get(getRepositoryToken(User));
    egressService = module.get(EgressService);

    jest.clearAllMocks();

    // Safe defaults so tests unrelated to recording/pose don't need to stub them.
    mockEgressService.startRoomComposite.mockResolvedValue({ status: 'recording' });
    mockParticipantRepo.find.mockResolvedValue([]);
    mockPoseServiceClient.startWorker.mockResolvedValue(undefined);
    mockPoseServiceClient.stopWorker.mockResolvedValue(undefined);
    mockLiveKitService.deleteRoom.mockResolvedValue(undefined);
  });

  describe('create', () => {
    it('should create a scheduled session by default and add the coach as a participant', async () => {
      const coachId = 'coach-123';
      const orgId = 'org-456';
      const dto = { scheduledAt: new Date().toISOString(), retentionDays: 30 };

      const mockSavedSession = {
        id: 'session-789',
        coachId,
        orgId,
        status: 'scheduled' as SessionStatus,
        scheduledAt: new Date(dto.scheduledAt),
        retentionDays: 30,
        livekitRoomName: 'room-xyz',
      };

      sessionRepo.save.mockResolvedValue(mockSavedSession as any);
      // create() calls join() internally, which looks the session back up.
      sessionRepo.findOne.mockResolvedValue({ id: 'session-789', status: 'scheduled' } as any);
      userRepo.count.mockResolvedValue(1); // User exists
      participantRepo.save.mockResolvedValue({} as any);

      const result = await service.create(coachId, orgId, dto);

      expect(result.status).toBe('scheduled');
      expect(sessionRepo.save).toHaveBeenCalled();
      expect(participantRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-789',
          userId: coachId,
          roleInSession: 'coach',
        }),
      );
    });

    it('should create a live session immediately if isInstant is true', async () => {
      const coachId = 'coach-123';
      const orgId = 'org-456';
      const dto = { scheduledAt: new Date().toISOString(), isInstant: true };

      sessionRepo.save.mockImplementation(async (s: any) => ({
        ...s,
        id: 'session-789',
      }));
      // create() calls join() internally, which looks the session back up.
      sessionRepo.findOne.mockResolvedValue({ id: 'session-789', status: 'live' } as any);
      userRepo.count.mockResolvedValue(1);
      participantRepo.save.mockResolvedValue({} as any);

      const result = await service.create(coachId, orgId, dto);

      expect(result.status).toBe('live');
      expect(result.startedAt).toBeDefined();
    });
  });

  describe('findAll listing checks', () => {
    it('should return all sessions for platform_admin', async () => {
      const user: JwtPayload = { sub: 'admin-1', role: 'platform_admin', email: 'a@a.com', sessionVersion: 1, orgId: null };
      sessionRepo.find.mockResolvedValue([{ id: 'sess-1' }] as any);

      const result = await service.findAll(user);
      expect(result).toHaveLength(1);
      expect(sessionRepo.find).toHaveBeenCalledWith({ order: { scheduledAt: 'DESC' } });
    });

    it('should return org sessions for studio_admin', async () => {
      const user: JwtPayload = { sub: 'sa-1', role: 'studio_admin', email: 's@a.com', orgId: 'org-1', sessionVersion: 1 };
      sessionRepo.find.mockResolvedValue([{ id: 'sess-2' }] as any);

      const result = await service.findAll(user);
      expect(result).toHaveLength(1);
      expect(sessionRepo.find).toHaveBeenCalledWith({
        where: { orgId: 'org-1' },
        order: { scheduledAt: 'DESC' },
      });
    });

    it('should return empty list if studio_admin has no orgId', async () => {
      const user: JwtPayload = { sub: 'sa-1', role: 'studio_admin', email: 's@a.com', orgId: null, sessionVersion: 1 };
      const result = await service.findAll(user);
      expect(result).toEqual([]);
    });

    it('should return coach-owned sessions for coach', async () => {
      const user: JwtPayload = { sub: 'coach-1', role: 'coach', email: 'c@a.com', sessionVersion: 1, orgId: null };
      sessionRepo.find.mockResolvedValue([{ id: 'sess-3' }] as any);

      const result = await service.findAll(user);
      expect(result).toHaveLength(1);
      expect(sessionRepo.find).toHaveBeenCalledWith({
        where: { coachId: 'coach-1' },
        order: { scheduledAt: 'DESC' },
      });
    });

    it('should use QueryBuilder to load student joined sessions', async () => {
      const user: JwtPayload = { sub: 'student-1', role: 'student', email: 'st@a.com', sessionVersion: 1, orgId: null };

      const mockQueryBuilder: any = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 'sess-4' }]),
      };

      sessionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll(user);
      expect(result).toHaveLength(1);
      expect(sessionRepo.createQueryBuilder).toHaveBeenCalledWith('session');
    });
  });

  describe('updateStatus lifecycle state enforcement', () => {
    const mockSession = (status: SessionStatus): Session => {
      const s = new Session();
      s.id = 'sess-id';
      s.status = status;
      s.coachId = 'coach-1';
      return s;
    };

    it('should transition scheduled to live and set startedAt', async () => {
      const session = mockSession('scheduled');
      sessionRepo.findOne.mockResolvedValue(session);
      sessionRepo.save.mockImplementation(async (s: any) => s);

      const result = await service.updateStatus('sess-id', 'live');
      expect(result.status).toBe('live');
      expect(result.startedAt).toBeDefined();
    });

    it('should transition live to ended and set endedAt', async () => {
      const session = mockSession('live');
      sessionRepo.findOne.mockResolvedValue(session);
      sessionRepo.save.mockImplementation(async (s: any) => s);

      const result = await service.updateStatus('sess-id', 'ended');
      expect(result.status).toBe('ended');
      expect(result.endedAt).toBeDefined();
    });

    it('should start a pose worker for each active approved participant when going live', async () => {
      const session = mockSession('scheduled');
      sessionRepo.findOne.mockResolvedValue(session);
      sessionRepo.save.mockImplementation(async (s: any) => s);
      mockParticipantRepo.find.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ] as any);

      await service.updateStatus('sess-id', 'live');

      expect(mockParticipantRepo.find).toHaveBeenCalledWith({
        where: { sessionId: 'sess-id', status: 'approved', leftAt: IsNull() },
      });
      expect(mockPoseServiceClient.startWorker).toHaveBeenCalledWith('sess-id', 'user-1');
      expect(mockPoseServiceClient.startWorker).toHaveBeenCalledWith('sess-id', 'user-2');
    });

    it('should stop pose workers for remaining active participants when ending', async () => {
      const session = mockSession('live');
      sessionRepo.findOne.mockResolvedValue(session);
      sessionRepo.save.mockImplementation(async (s: any) => s);
      mockParticipantRepo.find.mockResolvedValue([{ userId: 'user-1' }] as any);

      await service.updateStatus('sess-id', 'ended');

      expect(mockPoseServiceClient.stopWorker).toHaveBeenCalledWith('sess-id', 'user-1');
    });

    it('should delete the LiveKit room (authoritative teardown) when ending', async () => {
      const session = mockSession('live');
      sessionRepo.findOne.mockResolvedValue(session);
      sessionRepo.save.mockImplementation(async (s: any) => s);

      await service.updateStatus('sess-id', 'ended');

      expect(mockEgressService.stopSessionEgress).toHaveBeenCalledWith('sess-id');
      expect(mockLiveKitService.deleteRoom).toHaveBeenCalledWith('sess-id');
      // Egress must stop (recording finalizes) before the room is torn down.
      const stopOrder = mockEgressService.stopSessionEgress.mock.invocationCallOrder[0]!;
      const deleteOrder = mockLiveKitService.deleteRoom.mock.invocationCallOrder[0]!;
      expect(stopOrder).toBeLessThan(deleteOrder);
    });

    it('should throw BadRequestException on forbidden states (e.g. ended to live)', async () => {
      const session = mockSession('ended');
      sessionRepo.findOne.mockResolvedValue(session);

      await expect(service.updateStatus('sess-id', 'live')).rejects.toThrow(BadRequestException);
    });

    it('should return session unmodified if current and targets match', async () => {
      const session = mockSession('live');
      sessionRepo.findOne.mockResolvedValue(session);

      const result = await service.updateStatus('sess-id', 'live');
      expect(result).toBe(session);
      expect(sessionRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('join & leave operations', () => {
    it('should save a new participant on first join', async () => {
      userRepo.count.mockResolvedValue(1);
      participantRepo.findOne.mockResolvedValue(null);
      participantRepo.save.mockImplementation(async (p: any) => p);

      const result = await service.join('sess-1', 'user-1', 'student');
      expect(result.sessionId).toBe('sess-1');
      expect(result.userId).toBe('user-1');
      expect(result.roleInSession).toBe('student');
      expect(participantRepo.save).toHaveBeenCalled();
    });

    it('should reactivate a left participant on join override', async () => {
      userRepo.count.mockResolvedValue(1);
      const existing = new SessionParticipant();
      existing.sessionId = 'sess-1';
      existing.userId = 'user-1';
      existing.leftAt = new Date();

      participantRepo.findOne.mockResolvedValue(existing);
      participantRepo.save.mockImplementation(async (p: any) => p);

      const result = await service.join('sess-1', 'user-1', 'student');
      expect(result.leftAt).toBeNull();
      expect(participantRepo.save).toHaveBeenCalled();
    });

    it('should set leftAt when leave is called on active user', async () => {
      const active = new SessionParticipant();
      active.sessionId = 'sess-1';
      active.userId = 'user-1';
      active.leftAt = null;

      participantRepo.findOne.mockResolvedValue(active);
      participantRepo.save.mockImplementation(async (p: any) => p);

      const result = await service.leave('sess-1', 'user-1');
      expect(result.leftAt).toBeDefined();
    });

    it('should stop the pose worker for the leaving participant', async () => {
      const active = new SessionParticipant();
      active.sessionId = 'sess-1';
      active.userId = 'user-1';
      active.leftAt = null;

      participantRepo.findOne.mockResolvedValue(active);
      participantRepo.save.mockImplementation(async (p: any) => p);

      await service.leave('sess-1', 'user-1');
      expect(mockPoseServiceClient.stopWorker).toHaveBeenCalledWith('sess-1', 'user-1');
    });

    it('should error when leave called on non-participant', async () => {
      participantRepo.findOne.mockResolvedValue(null);
      await expect(service.leave('sess-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should be idempotent: leave on an already-left participant is a no-op, not an error', async () => {
      const alreadyLeft = new SessionParticipant();
      alreadyLeft.sessionId = 'sess-1';
      alreadyLeft.userId = 'user-1';
      alreadyLeft.leftAt = new Date('2026-01-01T00:00:00Z');

      participantRepo.findOne.mockResolvedValue(alreadyLeft);

      const result = await service.leave('sess-1', 'user-1');

      expect(result.leftAt).toEqual(alreadyLeft.leftAt);
      expect(participantRepo.save).not.toHaveBeenCalled();
      expect(mockPoseServiceClient.stopWorker).not.toHaveBeenCalled();
    });
  });

  describe('countActiveParticipants / endIfLive', () => {
    it('counts only approved, still-present participants', async () => {
      mockParticipantRepo.count.mockResolvedValue(2);

      const count = await service.countActiveParticipants('sess-1');

      expect(count).toBe(2);
      expect(mockParticipantRepo.count).toHaveBeenCalledWith({
        where: { sessionId: 'sess-1', status: 'approved', leftAt: IsNull() },
      });
    });

    it('ends a live session', async () => {
      sessionRepo.findOne.mockResolvedValue({ id: 'sess-1', status: 'live' } as any);
      sessionRepo.save.mockImplementation(async (s: any) => s);

      await service.endIfLive('sess-1');

      expect(mockEgressService.stopSessionEgress).toHaveBeenCalledWith('sess-1');
      expect(mockLiveKitService.deleteRoom).toHaveBeenCalledWith('sess-1');
    });

    it('does nothing if the session is not live (already ended, or never started)', async () => {
      sessionRepo.findOne.mockResolvedValue({ id: 'sess-1', status: 'ended' } as any);

      await service.endIfLive('sess-1');

      expect(sessionRepo.save).not.toHaveBeenCalled();
      expect(mockLiveKitService.deleteRoom).not.toHaveBeenCalled();
    });

    it('does nothing if the session does not exist', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(service.endIfLive('missing-sess')).resolves.toBeUndefined();
      expect(mockLiveKitService.deleteRoom).not.toHaveBeenCalled();
    });
  });
});
