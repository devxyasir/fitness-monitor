import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EgressWebhookController } from './egress-webhook.controller';
import { EgressService } from './egress.service';
import { Recording } from '../database/entities/others.entities';
import { WebhookReceiver } from 'livekit-server-sdk';

jest.mock('livekit-server-sdk', () => {
  const original = jest.requireActual('livekit-server-sdk');
  return {
    ...original,
    WebhookReceiver: jest.fn().mockImplementation(() => ({
      receive: jest.fn(),
    })),
  };
});

describe('EgressWebhookController', () => {
  let controller: EgressWebhookController;
  let recordingRepo: jest.Mocked<Repository<Recording>>;
  let egressService: jest.Mocked<EgressService>;
  let mockWebhookReceiverInstance: any;

  const mockRecordingRepo = {
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockEgressService = {
    startTrackComposite: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'livekit.apiKey') return 'test-key';
      if (key === 'livekit.apiSecret') return 'test-secret';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [EgressWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: EgressService,
          useValue: mockEgressService,
        },
        {
          provide: getRepositoryToken(Recording),
          useValue: mockRecordingRepo,
        },
      ],
    }).compile();

    controller = module.get<EgressWebhookController>(EgressWebhookController);
    recordingRepo = module.get(getRepositoryToken(Recording));
    egressService = module.get<any>(EgressService);
    
    mockWebhookReceiverInstance = (WebhookReceiver as jest.Mock).mock.results[0]?.value;
  });

  it('should compile and construct correctly', () => {
    expect(controller).toBeDefined();
    expect(WebhookReceiver).toHaveBeenCalledWith('test-key', 'test-secret');
  });

  describe('handleWebhook - track_published', () => {
    it('should trigger track composite Egress when a CAMERA video track is published', async () => {
      const mockEvent = {
        event: 'track_published',
        roomName: 'session_session-abc',
        participant: {
          identity: 'user-789',
          tracks: [
            { sid: 'audio-sid-1', type: 'AUDIO' },
            { sid: 'video-sid-1', type: 'VIDEO' },
          ],
        },
        track: {
          sid: 'video-sid-1',
          type: 'VIDEO',
          source: 'CAMERA',
        },
      };

      mockWebhookReceiverInstance.receive.mockResolvedValue(mockEvent);
      recordingRepo.findOne.mockResolvedValue(null); // No existing active recording
      egressService.startTrackComposite.mockResolvedValue({
        egressId: 'egress_track_123',
        status: 'recording',
      });

      const result = await controller.handleWebhook('valid-sig', mockEvent);

      expect(result).toEqual({ success: true });
      expect(recordingRepo.findOne).toHaveBeenCalled();
      expect(egressService.startTrackComposite).toHaveBeenCalledWith(
        'session-abc',
        'user-789',
        'audio-sid-1',
        'video-sid-1',
      );
    });

    it('should not start track composite Egress if an active track recording already exists', async () => {
      const mockEvent = {
        event: 'track_published',
        roomName: 'session_session-abc',
        participant: {
          identity: 'user-789',
          tracks: [{ sid: 'video-sid-1', type: 'VIDEO' }],
        },
        track: {
          sid: 'video-sid-1',
          type: 'VIDEO',
          source: 'CAMERA',
        },
      };

      mockWebhookReceiverInstance.receive.mockResolvedValue(mockEvent);
      recordingRepo.findOne.mockResolvedValue({ id: 'existing-recording' } as any);

      await controller.handleWebhook('valid-sig', mockEvent);

      expect(egressService.startTrackComposite).not.toHaveBeenCalled();
    });

    it('should ignore track published event if it is an AUDIO track', async () => {
      const mockEvent = {
        event: 'track_published',
        roomName: 'session_session-abc',
        participant: {
          identity: 'user-789',
          tracks: [{ sid: 'audio-sid-1', type: 'AUDIO' }],
        },
        track: {
          sid: 'audio-sid-1',
          type: 'AUDIO',
          source: 'MICROPHONE',
        },
      };

      mockWebhookReceiverInstance.receive.mockResolvedValue(mockEvent);

      await controller.handleWebhook('valid-sig', mockEvent);

      expect(egressService.startTrackComposite).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook - egress_updated / egress_ended', () => {
    it('should update duration and set status to ready for finished Room Composite', async () => {
      const mockEvent = {
        event: 'egress_ended',
        egressInfo: {
          egressId: 'egress_composite_123',
          roomName: 'session_session-xyz',
          status: 3, // EGRESS_FINISHED/finished
          duration: 34500000000, // 34.5 seconds
          segmented: {
            filenamePrefix: 'sessions/session-xyz/composite/segments/',
          },
        },
      };

      mockWebhookReceiverInstance.receive.mockResolvedValue(mockEvent);
      
      const mockRecordingRow = {
        id: 'rec-row-1',
        sessionId: 'session-xyz',
        trackType: 'composite',
        status: 'recording',
        durationSeconds: 0,
      };
      
      recordingRepo.findOne.mockResolvedValue(mockRecordingRow as any);
      recordingRepo.save.mockResolvedValue({} as any);

      const result = await controller.handleWebhook('valid-sig', mockEvent);

      expect(result).toEqual({ success: true });
      expect(recordingRepo.findOne).toHaveBeenCalledWith({
        where: { sessionId: 'session-xyz', trackType: 'composite' },
      });
      expect(recordingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'rec-row-1',
          durationSeconds: 35, // rounded from 34.5
          status: 'ready',
        }),
      );
    });
  });
});
