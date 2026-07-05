import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { ReplayService } from './replay.service';
import { Session } from '../sessions/session.entity';
import { ReplayEvent } from '../database/entities/others.entities';
import { RealtimeGateway } from '../realtime/realtime.gateway';

describe('ReplayService', () => {
  let service: ReplayService;
  let sessionRepo: jest.Mocked<Repository<Session>>;
  let replayEventRepo: jest.Mocked<Repository<ReplayEvent>>;
  let realtimeGateway: any;

  const mockSessionRepo = {
    findOne: jest.fn(),
  };

  const mockReplayEventRepo = {
    save: jest.fn(),
  };

  const mockRealtimeGateway = {
    emitBufferReplay: jest.fn(),
    emitBufferReplayEnd: jest.fn(),
    emitReplaySeek: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        ReplayService,
        {
          provide: getRepositoryToken(Session),
          useValue: mockSessionRepo,
        },
        {
          provide: getRepositoryToken(ReplayEvent),
          useValue: mockReplayEventRepo,
        },
        {
          provide: RealtimeGateway,
          useValue: mockRealtimeGateway,
        },
      ],
    }).compile();

    service = module.get<ReplayService>(ReplayService);
    sessionRepo = module.get(getRepositoryToken(Session));
    replayEventRepo = module.get(getRepositoryToken(ReplayEvent));
    realtimeGateway = module.get<RealtimeGateway>(RealtimeGateway);
  });

  it('should compile and construct', () => {
    expect(service).toBeDefined();
  });

  describe('seekReplay', () => {
    it('should throw NotFoundException if session does not exist', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(service.seekReplay('session-1', 'coach-1', 'student-1', -30000)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not the coach', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-2',
        status: 'live',
      } as any);

      await expect(service.seekReplay('session-1', 'coach-1', 'student-1', -30000)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw UnprocessableEntityException if session status is not live', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1',
        status: 'ended',
      } as any);

      await expect(service.seekReplay('session-1', 'coach-1', 'student-1', -30000)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should throw UnprocessableEntityException if fromOffsetMs is non-negative', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1',
        status: 'live',
      } as any);

      await expect(service.seekReplay('session-1', 'coach-1', 'student-1', 1000)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should call emitBufferReplay and save ReplayEvent audit log', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1',
        status: 'live',
      } as any);

      const result = await service.seekReplay('session-1', 'coach-1', 'student-1', -30000, 0);

      expect(result).toEqual({ success: true, fromOffsetMs: -30000, toOffsetMs: 0 });
      expect(mockRealtimeGateway.emitBufferReplay).toHaveBeenCalledWith(
        'session-1',
        'student-1',
        -30000,
        0,
      );
      expect(mockReplayEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          initiatedBy: 'coach-1',
          targetParticipantId: 'student-1',
          seekTimestampMs: -30000,
          sharedWithUserIds: ['student-1'],
        }),
      );
    });
  });

  describe('targetReplay', () => {
    it('should throw exception if target students array is empty', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1',
        status: 'live',
      } as any);

      await expect(service.targetReplay('session-1', 'coach-1', [], 1000)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should emit replay seek gateway triggers to targeted students room', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1',
        status: 'live',
      } as any);

      const result = await service.targetReplay(
        'session-1',
        'coach-1',
        ['student-1', 'student-2'],
        5000,
      );

      expect(result).toEqual({ success: true });
      expect(mockRealtimeGateway.emitReplaySeek).toHaveBeenCalledWith(
        'session-1',
        ['student-1', 'student-2'],
        { timestampMs: 5000 },
      );
    });
  });

  describe('endReplay', () => {
    it('should call emitBufferReplayEnd gateway broadcast and return success', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1',
        status: 'live',
      } as any);

      const result = await service.endReplay('session-1', 'coach-1');

      expect(result).toEqual({ success: true });
      expect(mockRealtimeGateway.emitBufferReplayEnd).toHaveBeenCalledWith('session-1');
    });
  });
});
