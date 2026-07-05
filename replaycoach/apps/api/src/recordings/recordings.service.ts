import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Recording } from '../database/entities/others.entities';

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

@Injectable()
export class RecordingsService {
  constructor(
    @InjectRepository(Recording)
    private readonly recordingRepository: Repository<Recording>,
  ) {}

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
