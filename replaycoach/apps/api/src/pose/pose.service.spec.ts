import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { PoseService } from './pose.service';
import { PoseKeypointFrame, Recording } from '../database/entities/others.entities';

// Fake Redis-backed recording cache — a simple Map is enough to prove hit/miss
// caching behavior without a real Redis connection.
const mockRedisStore = new Map<string, string>();
const mockRedisInstance = {
  get: jest.fn((key: string) => Promise.resolve(mockRedisStore.get(key) ?? null)),
  set: jest.fn((key: string, value: string) => {
    mockRedisStore.set(key, value);
    return Promise.resolve('OK');
  }),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockRedisInstance));

describe('PoseService', () => {
  let service: PoseService;
  let poseFrameRepository: Repository<PoseKeypointFrame>;
  let recordingRepository: Repository<Recording>;

  const mockPoseFrameRepository = {
    save: jest.fn().mockImplementation((frame) => Promise.resolve({ ...frame, id: 'frame-123' })),
    insert: jest.fn().mockResolvedValue({}),
    find: jest.fn(),
  };

  const mockRecordingRepository = {
    findOne: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoseService,
        { provide: getRepositoryToken(PoseKeypointFrame), useValue: mockPoseFrameRepository },
        { provide: getRepositoryToken(Recording), useValue: mockRecordingRepository },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PoseService>(PoseService);
    poseFrameRepository = module.get(getRepositoryToken(PoseKeypointFrame));
    recordingRepository = module.get(getRepositoryToken(Recording));

    mockRedisStore.clear();
    jest.clearAllMocks();
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ingestKeypoints', () => {
    it('should buffer keypoints and batch-insert on flush when a matching recording exists', async () => {
      mockRecordingRepository.findOne.mockResolvedValue({
        id: 'rec-1',
        sessionId: 'sess-1',
        participantId: 'user-1',
        trackType: 'track',
      });

      await service.ingestKeypoints({
        sessionId: 'sess-1',
        participantId: 'user-1',
        frameTimestampMs: 5000,
        keypoints: [
          { name: 'nose', x: 0.5, y: 0.3, score: 0.95 },
          { name: 'left_shoulder', x: 0.4, y: 0.5, score: 0.88 },
        ],
        confidenceAvg: 0.915,
      });

      expect(mockRecordingRepository.findOne).toHaveBeenCalledWith({
        where: { sessionId: 'sess-1', participantId: 'user-1', trackType: 'track' },
      });

      // Below the batch threshold — not flushed yet, only scheduled.
      expect(mockPoseFrameRepository.insert).not.toHaveBeenCalled();

      // Force the scheduled flush (module shutdown must not drop buffered frames).
      await service.onModuleDestroy();

      expect(mockPoseFrameRepository.insert).toHaveBeenCalledTimes(1);
      const rows = mockPoseFrameRepository.insert.mock.calls[0][0];
      expect(rows).toHaveLength(1);
      expect(rows[0].recordingId).toEqual('rec-1');
      expect(rows[0].frameTimestampMs).toEqual(5000);
      expect(rows[0].confidenceAvg).toEqual(0.915);
      expect(rows[0].keypoints).toEqual({
        nose: [0.5, 0.3, 0.95],
        left_shoulder: [0.4, 0.5, 0.88],
      });
    });

    it('should skip ingestion when no recording exists', async () => {
      mockRecordingRepository.findOne.mockResolvedValue(null);

      await service.ingestKeypoints({
        sessionId: 'sess-1',
        participantId: 'unknown-user',
        frameTimestampMs: 5000,
        keypoints: [{ name: 'nose', x: 0.5, y: 0.3, score: 0.95 }],
        confidenceAvg: 0.95,
      });

      await service.onModuleDestroy();
      expect(mockPoseFrameRepository.insert).not.toHaveBeenCalled();
    });

    it('should cache the recording lookup and only query the DB once per session/participant', async () => {
      mockRecordingRepository.findOne.mockResolvedValue({
        id: 'rec-1',
        sessionId: 'sess-1',
        participantId: 'user-1',
        trackType: 'track',
      });

      const frame = {
        sessionId: 'sess-1',
        participantId: 'user-1',
        frameTimestampMs: 1000,
        keypoints: [{ name: 'nose', x: 0.5, y: 0.3, score: 0.95 }],
        confidenceAvg: 0.95,
      };

      await service.ingestKeypoints(frame);
      await service.ingestKeypoints({ ...frame, frameTimestampMs: 2000 });
      await service.ingestKeypoints({ ...frame, frameTimestampMs: 3000 });

      expect(mockRecordingRepository.findOne).toHaveBeenCalledTimes(1);

      await service.onModuleDestroy();
      expect(mockPoseFrameRepository.insert).toHaveBeenCalledTimes(1);
      expect(mockPoseFrameRepository.insert.mock.calls[0][0]).toHaveLength(3);
    });

    it('should flush automatically once the batch size threshold is reached', async () => {
      mockRecordingRepository.findOne.mockResolvedValue({
        id: 'rec-1',
        sessionId: 'sess-1',
        participantId: 'user-1',
        trackType: 'track',
      });

      for (let i = 0; i < 50; i++) {
        await service.ingestKeypoints({
          sessionId: 'sess-1',
          participantId: 'user-1',
          frameTimestampMs: i * 100,
          keypoints: [{ name: 'nose', x: 0.5, y: 0.3, score: 0.95 }],
          confidenceAvg: 0.95,
        });
      }

      expect(mockPoseFrameRepository.insert).toHaveBeenCalledTimes(1);
      expect(mockPoseFrameRepository.insert.mock.calls[0][0]).toHaveLength(50);
    });
  });

  describe('getKeypoints', () => {
    it('should retrieve keypoints within the specified time range', async () => {
      const mockFrames = [
        { id: 'f1', recordingId: 'rec-1', frameTimestampMs: 1000, keypoints: {}, confidenceAvg: 0.9 },
        { id: 'f2', recordingId: 'rec-1', frameTimestampMs: 2000, keypoints: {}, confidenceAvg: 0.85 },
      ];
      mockPoseFrameRepository.find.mockResolvedValue(mockFrames);

      const result = await service.getKeypoints('rec-1', 0, 3000);

      expect(mockPoseFrameRepository.find).toHaveBeenCalledWith({
        where: {
          recordingId: 'rec-1',
          frameTimestampMs: expect.anything(),
        },
        order: { frameTimestampMs: 'ASC' },
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('getRecordingForParticipant', () => {
    it('should return the recording when it exists', async () => {
      const mockRecording = {
        id: 'rec-1',
        sessionId: 'sess-1',
        participantId: 'user-1',
        trackType: 'track',
      };
      mockRecordingRepository.findOne.mockResolvedValue(mockRecording);

      const result = await service.getRecordingForParticipant('sess-1', 'user-1');

      expect(result).toEqual(mockRecording);
    });

    it('should throw NotFoundException when recording does not exist', async () => {
      mockRecordingRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getRecordingForParticipant('sess-1', 'missing-user'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
