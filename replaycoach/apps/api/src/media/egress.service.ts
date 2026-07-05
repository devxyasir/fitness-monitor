import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EgressClient, SegmentedFileOutput, SegmentedFileProtocol, S3Upload } from 'livekit-server-sdk';
import { v4 as uuidv4 } from 'uuid';

import { RecordingsService } from '../recordings/recordings.service';

export interface EgressStartResult {
  egressId: string;
  status: 'recording' | 'failed';
  degradedReason?: string;
}

@Injectable()
export class EgressService {
  private readonly logger = new Logger(EgressService.name);
  private readonly egressClient: EgressClient | null = null;
  private readonly isMockEnabled: boolean = false;
  private readonly bucketName: string;
  private readonly region: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly recordingsService: RecordingsService,
  ) {
    const apiKey = this.configService.get<string>('livekit.apiKey');
    const apiSecret = this.configService.get<string>('livekit.apiSecret');
    const url = this.configService.get<string>('livekit.url', 'ws://localhost:7880');
    const environment = this.configService.get<string>('nodeEnv') ?? 'dev';

    this.bucketName = this.configService.get<string>('S3_RAW_RECORDINGS_BUCKET') ?? `replaycoach-${environment}-recordings-raw`;
    this.region = this.configService.get<string>('AWS_REGION') ?? 'us-east-1';

    if (!apiKey || !apiSecret) {
      this.logger.warn('LiveKit API key or secret missing. Local mock Egress will be enabled.');
      this.isMockEnabled = true;
    } else {
      const host = url.replace(/^ws/, 'http');
      this.egressClient = new EgressClient(host, apiKey, apiSecret);
    }
  }

  async startRoomComposite(sessionId: string): Promise<EgressStartResult> {
    const roomName = `session_${sessionId}`;
    const s3KeyPrefix = `sessions/${sessionId}/composite/segments/`;

    this.logger.log(`Starting Room Composite Egress for session ${sessionId} / Room: ${roomName}`);

    let egressId = `mock_composite_${uuidv4()}`;
    let degradedReason: string | undefined;

    if (!this.isMockEnabled && this.egressClient) {
      try {
        const s3 = new S3Upload({
          bucket: this.bucketName,
          region: this.region,
        });

        const segmentedOutput = new SegmentedFileOutput({
          protocol: SegmentedFileProtocol.HLS_PROTOCOL,
          segmentDuration: 4,
          filenamePrefix: s3KeyPrefix,
          output: {
            case: 's3',
            value: s3,
          },
        });

        const egressInfo = await this.egressClient.startRoomCompositeEgress(
          roomName,
          segmentedOutput,
          { layout: 'gallery' },
        );
        egressId = egressInfo.egressId;
        this.logger.log(`Started Room Composite Egress (LiveKit EgressId: ${egressId})`);
      } catch (err: unknown) {
        degradedReason = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to start Room Composite Egress for session ${sessionId} (non-blocking): ${degradedReason}`,
        );
      }
    }

    try {
      await this.recordingsService.create({
        sessionId,
        participantId: null,
        trackType: 'composite',
        egressId,
        s3KeyPrefix,
        status: degradedReason ? 'failed' : 'recording',
      });
      this.logger.log(`Saved Composite Recording row for session ${sessionId}`);
    } catch (dbErr: unknown) {
      const message = dbErr instanceof Error ? dbErr.message : String(dbErr);
      this.logger.error(`Database error saving recording metadata for session ${sessionId}: ${message}`);
    }

    return degradedReason
      ? {
          egressId,
          status: 'failed',
          degradedReason,
        }
      : {
          egressId,
          status: 'recording',
        };
  }

  async startTrackComposite(
    sessionId: string,
    participantId: string,
    audioTrackId: string | undefined,
    videoTrackId: string,
  ): Promise<EgressStartResult> {
    const roomName = `session_${sessionId}`;
    const s3KeyPrefix = `sessions/${sessionId}/participants/${participantId}/segments/`;

    this.logger.log(`Starting Track Egress and Composite for participant ${participantId} in session ${sessionId}`);

    let egressId = `mock_track_${uuidv4()}`;
    let degradedReason: string | undefined;

    if (!this.isMockEnabled && this.egressClient) {
      try {
        const s3 = new S3Upload({
          bucket: this.bucketName,
          region: this.region,
        });

        const segmentedOutput = new SegmentedFileOutput({
          protocol: SegmentedFileProtocol.HLS_PROTOCOL,
          segmentDuration: 4,
          filenamePrefix: s3KeyPrefix,
          output: {
            case: 's3',
            value: s3,
          },
        });

        const options: { videoTrackId: string; audioTrackId?: string } = {
          videoTrackId,
        };
        if (audioTrackId) {
          options.audioTrackId = audioTrackId;
        }

        const egressInfo = await this.egressClient.startTrackCompositeEgress(
          roomName,
          segmentedOutput,
          options,
        );
        egressId = egressInfo.egressId;
        this.logger.log(`Started Track Egress (LiveKit EgressId: ${egressId})`);
      } catch (err: unknown) {
        degradedReason = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to start Track Egress for participant ${participantId} in session ${sessionId} (non-blocking): ${degradedReason}`,
        );
      }
    }

    try {
      await this.recordingsService.create({
        sessionId,
        participantId,
        trackType: 'participant',
        egressId,
        s3KeyPrefix,
        status: degradedReason ? 'failed' : 'recording',
      });
      this.logger.log(`Saved Track Recording row for participant ${participantId} in session ${sessionId}`);
    } catch (dbErr: unknown) {
      const message = dbErr instanceof Error ? dbErr.message : String(dbErr);
      this.logger.error(`Database error saving recording metadata for participant ${participantId}: ${message}`);
    }

    return degradedReason
      ? {
          egressId,
          status: 'failed',
          degradedReason,
        }
      : {
          egressId,
          status: 'recording',
        };
  }

  async stopEgress(egressId: string): Promise<void> {
    if (this.isMockEnabled || !this.egressClient) {
      this.logger.log(`Mock stop egress called for EgressId: ${egressId}`);
      return;
    }

    if (egressId.startsWith('mock_')) {
      this.logger.log(`Skipping stop egress call for mock ID: ${egressId}`);
      return;
    }

    try {
      await this.egressClient.stopEgress(egressId);
      this.logger.log(`Stopped LiveKit Egress: ${egressId}`);
    } catch (err: any) {
      this.logger.warn(`Failed to stop Egress ${egressId}: ${err.message ?? err}`);
    }
  }

  async stopSessionEgress(sessionId: string): Promise<void> {
    const roomName = `session_${sessionId}`;
    this.logger.log(`Stopping egress for session ${sessionId} / Room: ${roomName}`);

    // Set recordings status to finalizing
    try {
      await this.recordingsService.markSessionRecordingsFinalizing(sessionId);
      this.logger.log(`Updated recordings to 'finalizing' for session ${sessionId}`);
    } catch (dbErr: unknown) {
      const message = dbErr instanceof Error ? dbErr.message : String(dbErr);
      this.logger.error(`Database error setting recordings to finalizing for session ${sessionId}: ${message}`);
    }

    if (this.isMockEnabled || !this.egressClient) {
      this.logger.log(`Mock stop all egress for room ${roomName} complete.`);
      return;
    }

    try {
      const activeEgresses = await this.egressClient.listEgress({ roomName });
      for (const egress of activeEgresses) {
        if (egress.status === 0 || egress.status === 1) { // 0 = EGRESS_STARTING, 1 = EGRESS_ACTIVE
          this.logger.log(`Stopping active EgressId: ${egress.egressId}`);
          await this.stopEgress(egress.egressId);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to stop session ${sessionId} Egress jobs: ${err.message ?? err}`);
    }
  }
}
