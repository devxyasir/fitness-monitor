import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, TrackSource } from 'livekit-server-sdk';

@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;
  private readonly url: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('livekit.apiKey');
    this.apiSecret = this.configService.get<string>('livekit.apiSecret');
    this.url = this.configService.get<string>('livekit.url', 'ws://localhost:7880');
  }

  getLiveKitUrl(): string {
    return this.url;
  }

  async generateToken(
    roomName: string,
    identity: string,
    participantName: string,
    role: string,
  ): Promise<string> {
    if (!this.apiKey || !this.apiSecret) {
      this.logger.warn(
        `LiveKit API credentials missing! Generating a mock join token for development. Identity: ${identity}`,
      );
      return `mock_token_for_${identity}_room_${roomName}_role_${role}`;
    }

    const isCoach = role === 'coach';

    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      name: participantName,
      ttl: '2h', // Short TTL (2 hours)
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: isCoach,
      // Restrict screen share to coach role at grant level:
      canPublishSources: isCoach
        ? ([TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE] as TrackSource[])
        : ([TrackSource.CAMERA, TrackSource.MICROPHONE] as TrackSource[]),
    });

    return at.toJwt();
  }
}
