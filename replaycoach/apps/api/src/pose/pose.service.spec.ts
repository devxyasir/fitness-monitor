import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { PoseService } from './pose.service';
import { PoseKeypointFrame, Recording } from '../database/entities/others.entities';

describe('PoseService', () => {
  let service: PoseService;
  let poseFrameRepository: Repository<PoseKeypointFrame>;
  let recordingRepository: Repository<Recording>;

  const mockPoseFrameRepository = {
    save: jest.fn().mockImplementation((frame) => Promise.resolve({ ...frame, id: 'frame-123' })),
    find: jest.fn(),
  };

  const mockRecordingRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoseService,
        { provide: getRepositoryToken(PoseKeypointFrame), useValue: mockPoseFrameRepository },
        { provide: getRepositoryToken(Recording), useValue: mockRecordingRepository },
      ],
    }).compile();

    service = module.get<PoseService>(PoseService);
    poseFrameRepository = module.get(getRepositoryToken(PoseKeypointFrame));
    recordingRepository = module.get(getRepositoryToken(Recording));

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ingestKeypoints', () => {
    it('should save keypoints when a matching recording exists', async () => {
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

      expect(mockPoseFrameRepository.save).toHaveBeenCalledTimes(1);
      const savedArg = mockPoseFrameRepository.save.mock.calls[0][0];
      expect(savedArg.recordingId).toEqual('rec-1');
      expect(savedArg.frameTimestampMs).toEqual(5000);
      expect(savedArg.confidenceAvg).toEqual(0.915);
      expect(savedArg.keypoints).toEqual({
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

      expect(mockPoseFrameRepository.save).not.toHaveBeenCalled();
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
