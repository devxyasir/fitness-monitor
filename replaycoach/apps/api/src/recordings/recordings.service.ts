import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Recording } from '../database/entities/others.entities';
import { CloudFrontSigner } from '../media/cloudfront-signer';

export type RecordingTrackType = 'participant' | 'composite';
export type RecordingStatus = 'recording' | 'finalizing' | 'ready' | 'failed';

interface CreateRecordingInput {
  sessionId: string;
  participantId: string | null;
  trackType: RecordingTrackType;
  egressId: string;
  s3KeyPrefix: string;
  status?: RecordingStatus;
}

export interface SessionRecordingPlayback {
  /** No recording exists yet, is still being generated, or failed —
   * distinct reasons the frontend renders differently ("still processing"
   * vs "no recording for this session" vs a hard failure). */
  state: 'ready' | 'processing' | 'unavailable';
  playUrl: string | null;
  durationSeconds: number;
}

@Injectable()
export class RecordingsService {
  constructor(
    @InjectRepository(Recording)
    private readonly recordingRepository: Repository<Recording>,
    private readonly cloudFrontSigner: CloudFrontSigner,
  ) {}

  /** The whole-room mixed recording (trackType 'composite') is what "watch
   * the session back" means for a coach/student after it ends — individual
   * per-participant tracks exist too but are an internal detail, not
   * exposed for playback (that's what the live in-session replay buffer and
   * clips are for). One composite recording per session. */
  async getSessionRecordingForPlayback(sessionId: string): Promise<SessionRecordingPlayback> {
    const recording = await this.recordingRepository.findOne({
      where: { sessionId, trackType: 'composite' },
      order: { createdAt: 'DESC' },
    });

    if (!recording) {
      return { state: 'unavailable', playUrl: null, durationSeconds: 0 };
    }
    if (recording.status === 'failed') {
      return { state: 'unavailable', playUrl: null, durationSeconds: 0 };
    }
    if (recording.status !== 'ready') {
      return { state: 'processing', playUrl: null, durationSeconds: recording.durationSeconds };
    }

    const playUrl = this.cloudFrontSigner.signUrl(`${recording.s3KeyPrefix}index.m3u8`);
    return { state: 'ready', playUrl, durationSeconds: recording.durationSeconds };
  }

  async create(input: CreateRecordingInput): Promise<Recording> {
    const recording = this.recordingRepository.create({
      sessionId: input.sessionId,
      participantId: input.participantId,
      trackType: input.trackType,
      egressId: input.egressId,
      s3KeyPrefix: input.s3KeyPrefix,
      status: input.status ?? 'recording',
      durationSeconds: 0,
    });

    return this.recordingRepository.save(recording);
  }

  async findActiveParticipantRecording(sessionId: string, participantId: string): Promise<Recording | null> {
    return this.recordingRepository.findOne({
      where: {
        sessionId,
        participantId,
        trackType: 'participant',
        status: 'recording',
      },
    });
  }

  async findByEgressId(egressId: string): Promise<Recording | null> {
    return this.recordingRepository.findOne({ where: { egressId } });
  }

  async updateStatusByEgressId(
    egressId: string,
    status: RecordingStatus,
    durationSeconds?: number,
  ): Promise<Recording | null> {
    const recording = await this.findByEgressId(egressId);
    if (!recording) {
      return null;
    }

    recording.status = status;
    if (durationSeconds !== undefined) {
      recording.durationSeconds = durationSeconds;
    }

    return this.recordingRepository.save(recording);
  }

  async markSessionRecordingsFinalizing(sessionId: string): Promise<void> {
    await this.recordingRepository.update(
      { sessionId, status: 'recording' },
      { status: 'finalizing' },
    );
  }
}
