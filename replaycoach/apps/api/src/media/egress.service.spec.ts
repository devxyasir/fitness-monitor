import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EgressService } from './egress.service';
import { RecordingsService } from '../recordings/recordings.service';
import { EgressClient } from 'livekit-server-sdk';

jest.mock('livekit-server-sdk', () => {
  const original = jest.requireActual('livekit-server-sdk');
  return {
    ...original,
    EgressClient: jest.fn().mockImplementation(() => ({
      startRoomCompositeEgress: jest.fn(),
      startTrackCompositeEgress: jest.fn(),
      stopEgress: jest.fn(),
      listEgress: jest.fn(),
    })),
  };
});

describe('EgressService', () => {
  let service: EgressService;
  let mockEgressClientInstance: any;

  const mockRecordingsService = {
    create: jest.fn(),
    markSessionRecordingsFinalizing: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'livekit.apiKey') return 'test-key';
      if (key === 'livekit.apiSecret') return 'test-secret';
      if (key === 'livekit.url') return 'ws://localhost:7880';
      if (key === 'S3_RAW_RECORDINGS_BUCKET') return 'test-raw-recordings';
      if (key === 'AWS_REGION') return 'us-east-1';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        EgressService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RecordingsService,
          useValue: mockRecordingsService,
        },
      ],
    }).compile();

    service = module.get<EgressService>(EgressService);

    // Retrieve mock egress client instance
    mockEgressClientInstance = (EgressClient as jest.Mock).mock.results[0]?.value;
  });

  it('should compile and construct correctly', () => {
    expect(service).toBeDefined();
    expect(EgressClient).toHaveBeenCalledWith('http://localhost:7880', 'test-key', 'test-secret');
  });

  describe('startRoomComposite', () => {
    it('should save a composite recording and call LiveKit startRoomCompositeEgress', async () => {
      mockEgressClientInstance.startRoomCompositeEgress.mockResolvedValue({
        egressId: 'egress_123_composite',
      });
      mockRecordingsService.create.mockResolvedValue({} as any);

      const egressId = await service.startRoomComposite('session-1');

      expect(egressId).toEqual({
        egressId: 'egress_123_composite',
        status: 'recording',
      });
      expect(mockEgressClientInstance.startRoomCompositeEgress).toHaveBeenCalledWith(
        'session_session-1',
        expect.any(Object),
        { layout: 'gallery' },
      );
      expect(mockRecordingsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          participantId: null,
          trackType: 'composite',
          egressId: 'egress_123_composite',
          status: 'recording',
        }),
      );
    });

    it('should handle egress client errors gracefully and still save a recording row', async () => {
      mockEgressClientInstance.startRoomCompositeEgress.mockRejectedValue(
        new Error('Livekit egress error'),
      );
      mockRecordingsService.create.mockResolvedValue({} as any);

      const egressId = await service.startRoomComposite('session-2');

      expect(egressId.status).toBe('failed');
      expect(egressId.egressId).toContain('mock_composite_');
      expect(mockRecordingsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-2',
          participantId: null,
          trackType: 'composite',
          status: 'failed',
        }),
      );
    });
  });

  describe('startTrackComposite', () => {
    it('should save a track recording and call LiveKit startTrackCompositeEgress', async () => {
      mockEgressClientInstance.startTrackCompositeEgress.mockResolvedValue({
        egressId: 'egress_456_track',
      });
      mockRecordingsService.create.mockResolvedValue({} as any);

      const egressId = await service.startTrackComposite(
        'session-1',
        'student-1',
        'audio-track-77',
        'video-track-88',
      );

      expect(egressId).toEqual({
        egressId: 'egress_456_track',
        status: 'recording',
      });
      expect(mockEgressClientInstance.startTrackCompositeEgress).toHaveBeenCalledWith(
        'session_session-1',
        expect.any(Object),
        { videoTrackId: 'video-track-88', audioTrackId: 'audio-track-77' },
      );
      expect(mockRecordingsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          participantId: 'student-1',
          trackType: 'participant',
          egressId: 'egress_456_track',
          status: 'recording',
        }),
      );
    });
  });

  describe('stopSessionEgress', () => {
    it('should query active egresses and call stopEgress, updating database rows to finalizing', async () => {
      mockEgressClientInstance.listEgress.mockResolvedValue([
        { egressId: 'egress_active', status: 1 }, // 1 = ACTIVE
        { egressId: 'egress_ended', status: 3 },  // 3 = FINISHED
      ]);
      mockEgressClientInstance.stopEgress.mockResolvedValue({} as any);
      mockRecordingsService.markSessionRecordingsFinalizing.mockResolvedValue(undefined);

      await service.stopSessionEgress('session-1');

      expect(mockRecordingsService.markSessionRecordingsFinalizing).toHaveBeenCalledWith('session-1');
      expect(mockEgressClientInstance.listEgress).toHaveBeenCalledWith({
        roomName: 'session_session-1',
      });
      expect(mockEgressClientInstance.stopEgress).toHaveBeenCalledWith('egress_active');
      expect(mockEgressClientInstance.stopEgress).not.toHaveBeenCalledWith('egress_ended');
    });
  });
});
