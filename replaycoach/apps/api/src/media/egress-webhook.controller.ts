import { Body, Controller, forwardRef, Headers, Inject, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookReceiver } from 'livekit-server-sdk';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { EgressService } from './egress.service';
import { RecordingsService, RecordingStatus } from '../recordings/recordings.service';
import { SessionsService } from '../sessions/sessions.service';
import { Public } from '../common/decorators/public.decorator';

interface LiveKitTrack {
  sid?: string;
  type?: string | number;
  source?: string | number;
}

interface LiveKitParticipant {
  identity?: string;
  tracks?: LiveKitTrack[];
}

interface LiveKitSegmentsInfo {
  /** The real SDK type (protobuf int64) is `bigint` — kept widened here
   * since this interface also backs hand-built test fixtures using plain
   * numbers/strings. */
  size?: string | number | bigint;
}

interface LiveKitEgressInfo {
  egressId?: string;
  status?: string | number;
  duration?: string | number;
  /** JSON-webhook payloads serialize protobuf int64 fields as strings —
   * see Recording.sizeBytes's doc comment for why this needs coercing. */
  segmentResults?: LiveKitSegmentsInfo[];
}

interface LiveKitRoom {
  name?: string;
}

interface LiveKitWebhookEvent {
  event?: string;
  room?: LiveKitRoom;
  participant?: LiveKitParticipant;
  track?: LiveKitTrack;
  egressInfo?: LiveKitEgressInfo;
}

/** Pose-service subscriber bots — never count these as real participants. */
function isPoseWorkerIdentity(identity: string): boolean {
  return identity.startsWith('pose_worker_');
}

/** `session_<id>` -> `<id>`, or null if the room isn't one of ours. */
function sessionIdFromRoomName(roomName: string | undefined): string | null {
  if (!roomName || !roomName.startsWith('session_')) return null;
  return roomName.slice('session_'.length);
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
    @Inject(forwardRef(() => SessionsService))
    private readonly sessionsService: SessionsService,
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

  /** No JWT here by design — LiveKit calls this directly and self-verifies
   * via HMAC signature (see constructor/isMockEnabled below), not a bearer
   * token. Now that JwtAuthGuard is global, this needs an explicit opt-out. */
  @Public()
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
      } else if (eventName === 'participant_left') {
        await this.handleParticipantLeft(event);
      } else if (eventName === 'room_finished') {
        await this.handleRoomFinished(event);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error processing webhook event ${eventName}: ${message}`);
    }

    return { success: true };
  }

  private async handleTrackPublished(event: any): Promise<void> {
    // NOTE: WebhookEvent carries the room under a nested `room: { name }`, not a
    // flat `roomName` — the field this used to read doesn't exist on the real
    // parsed event (only in this file's own hand-built test fixtures), so this
    // handler silently no-op'd on every real webhook call. Fixed alongside FIX_09
    // since the new participant_left/room_finished handlers need the same field.
    const roomName = event.room?.name;
    const participant = event.participant;
    const track = event.track;

    if (!roomName || !participant || !track) {
      return;
    }

    const sessionId = sessionIdFromRoomName(roomName);
    if (!sessionId) {
      this.logger.debug(`Ignoring track published event for room ${roomName} (does not start with session_)`);
      return;
    }
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

    const rawSize = egressInfo.segmentResults?.[0]?.size;
    const sizeBytes = rawSize !== undefined ? Number(rawSize) : undefined;

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
      sizeBytes,
    );

    if (!recording) {
      this.logger.warn(`Rejecting egress webhook for unknown egressId ${egressId}`);
      return;
    }

    this.logger.log(`Updated recording ${recording.id} from egress ${egressId} to ${recording.status}`);
  }

  /**
   * Authoritative presence signal: a participant left the LiveKit room,
   * independent of whether their browser/socket ever told us. Idempotent via
   * SessionsService.leave(). If that was the last real (non-bot) participant,
   * auto-end the session so it doesn't record forever.
   */
  private async handleParticipantLeft(event: any): Promise<void> {
    const sessionId = sessionIdFromRoomName(event.room?.name);
    const identity = event.participant?.identity;

    if (!sessionId || !identity) return;
    if (isPoseWorkerIdentity(identity)) return; // bots aren't real participants

    try {
      await this.sessionsService.leave(sessionId, identity);
    } catch (err: unknown) {
      // A participant_left for an identity we don't track (e.g. never joined
      // through our API) is not actionable — log and move on.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Ignoring participant_left for unknown participant ${identity} in session ${sessionId}: ${message}`);
      return;
    }

    const remaining = await this.sessionsService.countActiveParticipants(sessionId);
    if (remaining === 0) {
      await this.sessionsService.endIfLive(sessionId);
    }
  }

  /** The LiveKit room fully closed — the session is over regardless of our own bookkeeping. */
  private async handleRoomFinished(event: any): Promise<void> {
    const sessionId = sessionIdFromRoomName(event.room?.name);
    if (!sessionId) return;
    await this.sessionsService.endIfLive(sessionId);
  }
}
