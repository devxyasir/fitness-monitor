import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';

import { PoseKeypointFrame, Recording } from '../database/entities/others.entities';
import type { PoseFrameDto, Keypoint } from '@replaycoach/types';

@Injectable()
export class PoseService {
  private readonly logger = new Logger(PoseService.name);

  constructor(
    @InjectRepository(PoseKeypointFrame)
    private readonly poseFrameRepository: Repository<PoseKeypointFrame>,
    @InjectRepository(Recording)
    private readonly recordingRepository: Repository<Recording>,
  ) {}

  /**
   * Ingest a keypoint frame from the Redis Stream consumer.
   * Persists asynchronously — never in the critical path.
   */
  async ingestKeypoints(data: PoseFrameDto): Promise<void> {
    const { sessionId, participantId, frameTimestampMs, keypoints, confidenceAvg } = data;

    // Look up the recording row for this participant's track
    const recording = await this.recordingRepository.findOne({
      where: { sessionId, participantId, trackType: 'track' },
    });

    if (!recording) {
      this.logger.warn(
        `No track recording found for session=${sessionId} participant=${participantId} — skipping keypoint ingestion`,
      );
      return;
    }

    const frame = new PoseKeypointFrame();
    frame.recordingId = recording.id;
    frame.frameTimestampMs = frameTimestampMs;
    frame.keypoints = Object.fromEntries(
      keypoints.map((kp: Keypoint) => [kp.name, [kp.x, kp.y, kp.score]]),
    );
    frame.confidenceAvg = confidenceAvg;

    await this.poseFrameRepository.save(frame);
  }

  /**
   * Retrieve stored keypoints for a recording within a time range.
   * Used for replay skeleton overlay — reads from DB, not live inference.
   */
  async getKeypoints(
    recordingId: string,
    startMs: number,
    endMs: number,
  ): Promise<PoseKeypointFrame[]> {
    return this.poseFrameRepository.find({
      where: {
        recordingId,
        frameTimestampMs: Between(startMs, endMs),
      },
      order: { frameTimestampMs: 'ASC' },
    });
  }

  /**
   * Resolve the recording for a participant in a session.
   * Throws NotFoundException if no track recording exists.
   */
  async getRecordingForParticipant(
    sessionId: string,
    participantId: string,
  ): Promise<Recording> {
    const recording = await this.recordingRepository.findOne({
      where: { sessionId, participantId, trackType: 'track' },
    });

    if (!recording) {
      throw new NotFoundException(
        `No track recording found for participant ${participantId} in session ${sessionId}`,
      );
    }

    return recording;
  }
}
