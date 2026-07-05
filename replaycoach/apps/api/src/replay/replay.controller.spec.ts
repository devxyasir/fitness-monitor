import { Test } from '@nestjs/testing';
import { ReplayController } from './replay.controller';
import { ReplayService } from './replay.service';
import { SessionsService } from '../sessions/sessions.service';
import type { JwtPayload } from '@replaycoach/types';

describe('ReplayController', () => {
  let controller: ReplayController;
  let service: jest.Mocked<ReplayService>;

  const mockReplayService = {
    seekReplay: jest.fn(),
    targetReplay: jest.fn(),
    endReplay: jest.fn(),
  };

  const mockSessionsService = {
    findById: jest.fn(),
    isParticipant: jest.fn(),
  };

  const mockUser: JwtPayload = {
    sub: 'coach-1',
    email: 'coach@example.com',
    role: 'coach',
    orgId: 'org-1',
    sessionVersion: 1,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [ReplayController],
      providers: [
        {
          provide: ReplayService,
          useValue: mockReplayService,
        },
        {
          provide: SessionsService,
          useValue: mockSessionsService,
        },
      ],
    }).compile();

    controller = module.get<ReplayController>(ReplayController);
    service = module.get(ReplayService);
  });

  it('should compile and construct', () => {
    expect(controller).toBeDefined();
  });

  describe('seek', () => {
    it('should call seekReplay with correct parameters and return success response', async () => {
      const mockResult = {
        success: true,
        fromOffsetMs: -30000,
        toOffsetMs: 0,
      };
      service.seekReplay.mockResolvedValue(mockResult);

      const result = await controller.seek('session-1', mockUser, {
        participantId: 'student-1',
        fromOffsetMs: -30000,
        toOffsetMs: 0,
      });

      expect(result).toEqual(mockResult);
      expect(service.seekReplay).toHaveBeenCalledWith('session-1', 'coach-1', 'student-1', -30000, 0);
    });
  });

  describe('target', () => {
    it('should call targetReplay with correct options', async () => {
      service.targetReplay.mockResolvedValue({ success: true });

      const result = await controller.target('session-1', mockUser, {
        studentIds: ['student-1', 'student-2'],
        timestampMs: 5000,
      });

      expect(result).toEqual({ success: true });
      expect(service.targetReplay).toHaveBeenCalledWith(
        'session-1',
        'coach-1',
        ['student-1', 'student-2'],
        5000,
      );
    });
  });

  describe('end', () => {
    it('should call endReplay', async () => {
      service.endReplay.mockResolvedValue({ success: true });

      const result = await controller.end('session-1', mockUser);

      expect(result).toEqual({ success: true });
      expect(service.endReplay).toHaveBeenCalledWith('session-1', 'coach-1');
    });
  });
});
