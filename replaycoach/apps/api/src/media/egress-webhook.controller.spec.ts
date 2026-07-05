import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EgressWebhookController } from './egress-webhook.controller';
import { EgressService } from './egress.service';
import { RecordingsService } from '../recordings/recordings.service';
import { SessionsService } from '../sessions/sessions.service';
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
  let egressService: jest.Mocked<EgressService>;
  let mockWebhookReceiverInstance: any;

  const mockRecordingsService = {
    findActiveParticipantRecording: jest.fn(),
    updateStatusByEgressId: jest.fn(),
  };

  const mockEgressService = {
    startTrackComposite: jest.fn(),
  };

  const mockSessionsService = {
    leave: jest.fn(),
    countActiveParticipants: jest.fn(),
    endIfLive: jest.fn(),
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
          provide: RecordingsService,
          useValue: mockRecordingsService,
        },
        {
          provide: SessionsService,
          useValue: mockSessionsService,
        },
      ],
    }).compile();

    controller = module.get<EgressWebhookController>(EgressWebhookController);
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
        room: { name: 'session_session-abc' },
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
      mockRecordingsService.findActiveParticipantRecording.mockResolvedValue(null); // No existing active recording
      egressService.startTrackComposite.mockResolvedValue({
        egressId: 'egress_track_123',
        status: 'recording',
      });

      const result = await controller.handleWebhook('valid-sig', mockEvent);

      expect(result).toEqual({ success: true });
      expect(mockRecordingsService.findActiveParticipantRecording).toHaveBeenCalledWith('session-abc', 'user-789');
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
        room: { name: 'session_session-abc' },
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
      mockRecordingsService.findActiveParticipantRecording.mockResolvedValue({ id: 'existing-recording' });

      await controller.handleWebhook('valid-sig', mockEvent);

      expect(egressService.startTrackComposite).not.toHaveBeenCalled();
    });

    it('should ignore track published event if it is an AUDIO track', async () => {
      const mockEvent = {
        event: 'track_published',
        room: { name: 'session_session-abc' },
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

    it('should ignore track published event for a room not owned by this app', async () => {
      const mockEvent = {
        event: 'track_published',
        room: { name: 'some-other-room' },
        participant: { identity: 'user-789', tracks: [] },
        track: { sid: 'video-sid-1', type: 'VIDEO', source: 'CAMERA' },
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

      mockRecordingsService.updateStatusByEgressId.mockResolvedValue({
        id: 'rec-row-1',
        sessionId: 'session-xyz',
        trackType: 'composite',
        status: 'ready',
        durationSeconds: 35,
      });

      const result = await controller.handleWebhook('valid-sig', mockEvent);

      expect(result).toEqual({ success: true });
      expect(mockRecordingsService.updateStatusByEgressId).toHaveBeenCalledWith(
        'egress_composite_123',
        'ready',
        35, // rounded from 34.5
      );
    });
  });

  describe('handleWebhook - participant_left', () => {
    it('should record the leave and check for auto-end', async () => {
      const mockEvent = {
        event: 'participant_left',
        room: { name: 'session_session-abc' },
        participant: { identity: 'user-789' },
      };

      mockWebhookReceiverInstance.receive.mockResolvedValue(mockEvent);
      mockSessionsService.leave.mockResolvedValue({ leftAt: new Date() });
      mockSessionsService.countActiveParticipants.mockResolvedValue(1);

      await controller.handleWebhook('valid-sig', mockEvent);

      expect(mockSessionsService.leave).toHaveBeenCalledWith('session-abc', 'user-789');
      expect(mockSessionsService.countActiveParticipants).toHaveBeenCalledWith('session-abc');
      expect(mockSessionsService.endIfLive).not.toHaveBeenCalled();
    });

    it('should auto-end the session when the last real participant leaves', async () => {
      const mockEvent = {
        event: 'participant_left',
        room: { name: 'session_session-abc' },
        participant: { identity: 'user-789' },
      };

      mockWebhookReceiverInstance.receive.mockResolvedValue(mockEvent);
      mockSessionsService.leave.mockResolvedValue({ leftAt: new Date() });
      mockSessionsService.countActiveParticipants.mockResolvedValue(0);

      await controller.handleWebhook('valid-sig', mockEvent);

      expect(mockSessionsService.endIfLive).toHaveBeenCalledWith('session-abc');
    });

    it('should ignore pose-worker bot identities', async () => {
      const mockEvent = {
        event: 'participant_left',
        room: { name: 'session_session-abc' },
        participant: { identity: 'pose_worker_session-abc_user-1' },
      };

      mockWebhookReceiverInstance.receive.mockResolvedValue(mockEvent);

      await controller.handleWebhook('valid-sig', mockEvent);

      expect(mockSessionsService.leave).not.toHaveBeenCalled();
    });

    it('should not crash when the participant is unknown to us', async () => {
      const mockEvent = {
        event: 'participant_left',
        room: { name: 'session_session-abc' },
        participant: { identity: 'unknown-user' },
      };

      mockWebhookReceiverInstance.receive.mockResolvedValue(mockEvent);
      mockSessionsService.leave.mockRejectedValue(new Error('not found'));

      const result = await controller.handleWebhook('valid-sig', mockEvent);

      expect(result).toEqual({ success: true });
      expect(mockSessionsService.countActiveParticipants).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook - room_finished', () => {
    it('should end the session unconditionally when the room finishes', async () => {
      const mockEvent = {
        event: 'room_finished',
        room: { name: 'session_session-abc' },
      };

      mockWebhookReceiverInstance.receive.mockResolvedValue(mockEvent);

      await controller.handleWebhook('valid-sig', mockEvent);

      expect(mockSessionsService.endIfLive).toHaveBeenCalledWith('session-abc');
    });
  });
});
