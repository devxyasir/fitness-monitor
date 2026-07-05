import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LiveKitService } from './livekit.service';
import { AccessToken } from 'livekit-server-sdk';

jest.mock('livekit-server-sdk', () => {
  return {
    AccessToken: jest.fn().mockImplementation(() => {
      return {
        addGrant: jest.fn(),
        toJwt: jest.fn().mockResolvedValue('signed-jwt-token'),
      };
    }),
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
});
