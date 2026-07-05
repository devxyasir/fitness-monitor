import { Body, Controller, Headers, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookReceiver } from 'livekit-server-sdk';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { EgressService } from './egress.service';
import { RecordingsService, RecordingStatus } from '../recordings/recordings.service';

interface LiveKitTrack {
  sid?: string;
  type?: string | number;
  source?: string | number;
}

interface LiveKitParticipant {
  identity?: string;
  tracks?: LiveKitTrack[];
}

interface LiveKitEgressInfo {
  egressId?: string;
  status?: string | number;
  duration?: string | number;
}

interface LiveKitWebhookEvent {
  event?: string;
  roomName?: string;
  participant?: LiveKitParticipant;
  track?: LiveKitTrack;
  egressInfo?: LiveKitEgressInfo;
}

@Controller('media')
export class EgressWebhookController {
  private readonly logger = new Logger(EgressWebhookController.name);
  private webhookReceiver: WebhookReceiver | null = null;
  private readonly isMockEnabled: boolean = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly egressService: EgressService,
    private readonly recordingsService: RecordingsService,
  ) {
    const apiKey = this.configService.get<string>('livekit.apiKey');
    const apiSecret = this.configService.get<string>('livekit.apiSecret');

    if (!apiKey || !apiSecret) {
      this.logger.warn('LiveKit credentials missing. Webhook signature checking will not run.');
      this.isMockEnabled = true;
    } else {
      this.webhookReceiver = new WebhookReceiver(apiKey, apiSecret);
    }
  }

  @Post('egress-webhook')
  async handleWebhook(
    @Headers('authorization') authHeader: string,
    @Body() body: LiveKitWebhookEvent,
    @Req() req?: RawBodyRequest<Request>,
  ) {
    let event: LiveKitWebhookEvent = body;

    if (!this.isMockEnabled && this.webhookReceiver) {
      if (!authHeader) {
        throw new UnauthorizedException('Missing LiveKit webhook signature');
      }

      try {
        const rawBody = req?.rawBody?.toString('utf8') ?? JSON.stringify(body);
        event = await this.webhookReceiver.receive(rawBody, authHeader) as LiveKitWebhookEvent;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`LiveKit webhook signature verification failed: ${message}`);
        throw new UnauthorizedException('Invalid LiveKit webhook signature');
      }
    }

    const eventName = event.event;
    if (!eventName) {
      return { success: true };
    }

    this.logger.log(`Received LiveKit webhook event: ${eventName}`);

    try {
      if (eventName === 'track_published') {
        await this.handleTrackPublished(event);
      } else if (eventName === 'egress_updated' || eventName === 'egress_ended') {
        await this.handleEgressEvent(event);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error processing webhook event ${eventName}: ${message}`);
    }

    return { success: true };
  }

  private async handleTrackPublished(event: any): Promise<void> {
    const roomName = event.roomName;
    const participant = event.participant;
    const track = event.track;

    if (!roomName || !participant || !track) {
      return;
    }

    // Conventions: room name is session_{sessionId}
    if (!roomName.startsWith('session_')) {
      this.logger.debug(`Ignoring track published event for room ${roomName} (does not start with session_)`);
      return;
    }
    const sessionId = roomName.replace('session_', '');
    const participantId = participant.identity;

    // 0 = AUDIO, 1 = VIDEO
    // source: 1 = CAMERA, 2 = MICROPHONE, 3 = SCREEN_SHARE, 4 = SCREEN_SHARE_AUDIO
    const trackType = track.type;
    const trackSource = track.source;

    // We only trigger egress recording when a camera video track is published
    const isCameraVideo =
      trackType === 1 ||
      trackType === 'VIDEO' ||
      trackSource === 1 ||
      trackSource === 'CAMERA';

    if (!isCameraVideo) {
      return;
    }

    // Check if we already have an active recording row for this participant track
    const existing = await this.recordingsService.findActiveParticipantRecording(sessionId, participantId);

    if (existing) {
      this.logger.log(`Active track recording already exists for participant ${participantId} in session ${sessionId}`);
      return;
    }

    // Find the participant's video and audio track SIDs from the event participant.tracks list
    let videoTrackId = track.sid;
    let audioTrackId: string | undefined;

    if (participant.tracks && Array.isArray(participant.tracks)) {
      for (const t of participant.tracks) {
        if (t.type === 0 || t.type === 'AUDIO') {
          audioTrackId = t.sid;
          break;
        }
      }
    }

    this.logger.log(`Starting participant track composite egress. Video: ${videoTrackId}, Audio: ${audioTrackId}`);
    await this.egressService.startTrackComposite(
      sessionId,
      participantId,
      audioTrackId,
      videoTrackId,
    );
  }

  private async handleEgressEvent(event: any): Promise<void> {
    const egressInfo = event.egressInfo;
    if (!egressInfo) {
      return;
    }

    const eventName = event.event;
    const egressId = egressInfo.egressId;
    const status = egressInfo.status; // status enum values refer to start, active, end etc.

    this.logger.log(`Processing Egress Update: ${egressId}, Webhook event: ${eventName}, status: ${status}`);

    if (!egressId) {
      this.logger.warn('Ignoring egress webhook without egressId');
      return;
    }

    const durationSeconds = egressInfo.duration
      ? Math.round(Number(egressInfo.duration) / 1_000_000_000)
      : undefined;

    let recordingStatus: RecordingStatus = 'recording';
    if (eventName === 'egress_ended' || status === 3 || status === 'EGRESS_FINISHED') {
      recordingStatus = 'ready';
    } else if (status === 4 || status === 'EGRESS_FAILED' || status === 5 || status === 'EGRESS_LIMIT_REACHED') {
      recordingStatus = 'failed';
    }

    const recording = await this.recordingsService.updateStatusByEgressId(
      egressId,
      recordingStatus,
      durationSeconds,
    );

    if (!recording) {
      this.logger.warn(`Rejecting egress webhook for unknown egressId ${egressId}`);
      return;
    }

    this.logger.log(`Updated recording ${recording.id} from egress ${egressId} to ${recording.status}`);
  }
}
