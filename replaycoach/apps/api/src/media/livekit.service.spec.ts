import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LiveKitService, liveKitRoomName } from './livekit.service';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const mockDeleteRoom = jest.fn();

jest.mock('livekit-server-sdk', () => {
  return {
    AccessToken: jest.fn().mockImplementation(() => {
      return {
        addGrant: jest.fn(),
        toJwt: jest.fn().mockResolvedValue('signed-jwt-token'),
      };
    }),
    RoomServiceClient: jest.fn().mockImplementation(() => ({
      deleteRoom: mockDeleteRoom,
    })),
    TrackSource: {
      CAMERA: 'camera',
      MICROPHONE: 'microphone',
      SCREEN_SHARE: 'screen_share',
    },
  };
});

describe('LiveKitService', () => {
  let service: LiveKitService;
  let mockConfigService: any;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'livekit.apiKey') return 'test-api-key';
        if (key === 'livekit.apiSecret') return 'test-api-secret';
        if (key === 'livekit.url') return 'ws://test-livekit:7880';
        return defaultValue;
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        LiveKitService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LiveKitService>(LiveKitService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return livekit url', () => {
    expect(service.getLiveKitUrl()).toBe('ws://test-livekit:7880');
  });

  it('should mint a signed token when credentials are provided', async () => {
    const token = await service.generateToken(
      'session_123',
      'user_abc',
      'John Doe',
      'coach',
    );
    expect(token).toBe('signed-jwt-token');
    expect(AccessToken).toHaveBeenCalledWith('test-api-key', 'test-api-secret', expect.objectContaining({
      identity: 'user_abc',
      name: 'John Doe',
    }));
  });

  it('should fallback to mock token if API credentials are not provided', async () => {
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'livekit.apiKey') return undefined;
      if (key === 'livekit.apiSecret') return undefined;
      if (key === 'livekit.url') return 'ws://localhost:7880';
      return defaultValue;
    });

    const serviceNoCreds = new LiveKitService(mockConfigService);
    const token = await serviceNoCreds.generateToken(
      'session_123',
      'user_abc',
      'John Doe',
      'student',
    );
    expect(token).toContain('mock_token_for_user_abc_room_session_123_role_student');
  });

  describe('liveKitRoomName', () => {
    it('derives the canonical room name from a session id', () => {
      expect(liveKitRoomName('abc-123')).toBe('session_abc-123');
    });
  });

  describe('deleteRoom', () => {
    it('deletes the canonical room via RoomServiceClient when credentials are present', async () => {
      mockDeleteRoom.mockResolvedValue(undefined);

      await service.deleteRoom('sess-1');

      expect(RoomServiceClient).toHaveBeenCalledWith('http://test-livekit:7880', 'test-api-key', 'test-api-secret');
      expect(mockDeleteRoom).toHaveBeenCalledWith('session_sess-1');
    });

    it('is a non-fatal no-op when RoomServiceClient throws (room already gone)', async () => {
      mockDeleteRoom.mockRejectedValue(new Error('room not found'));

      await expect(service.deleteRoom('sess-1')).resolves.toBeUndefined();
    });

    it('skips deletion without throwing when LiveKit credentials are missing', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'livekit.apiKey') return undefined;
        if (key === 'livekit.apiSecret') return undefined;
        if (key === 'livekit.url') return 'ws://localhost:7880';
        return defaultValue;
      });
      const serviceNoCreds = new LiveKitService(mockConfigService);

      await expect(serviceNoCreds.deleteRoom('sess-1')).resolves.toBeUndefined();
      expect(mockDeleteRoom).not.toHaveBeenCalled();
    });
  });
});
