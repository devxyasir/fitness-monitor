import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, Between } from 'typeorm';
import Redis from 'ioredis';

import { PoseKeypointFrame, Recording } from '../database/entities/others.entities';
import type { PoseFrameDto, Keypoint } from '@replaycoach/types';

const FLUSH_BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 1000;

// Recording lookups are cached in Redis (not an in-process Map) so every API
// instance shares the same cache once running multi-instance (FIX_07 §3d).
const RECORDING_CACHE_PREFIX = 'pose:recording-cache:';
const RECORDING_CACHE_HIT_TTL_SEC = 60 * 60; // recordingId is immutable for a session's lifetime
const RECORDING_CACHE_MISS_TTL_SEC = 15; // re-check soon — the track recording may not exist yet
const RECORDING_CACHE_NONE = '__none__';

@Injectable()
export class PoseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PoseService.name);
  private redis!: Redis;

  private buffer: PoseKeypointFrame[] = [];
  private flushTimer: NodeJS.Timeout | undefined;

  constructor(
    @InjectRepository(PoseKeypointFrame)
    private readonly poseFrameRepository: Repository<PoseKeypointFrame>,
    @InjectRepository(Recording)
    private readonly recordingRepository: Repository<Recording>,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.configService.get<string>('redis.url', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);
    this.redis.on('error', (err) => {
      this.logger.error(`Pose recording-cache Redis error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.flush();
    if (this.redis) await this.redis.quit();
  }

  private async resolveRecordingId(sessionId: string, participantId: string): Promise<string | null> {
    const key = `${RECORDING_CACHE_PREFIX}${sessionId}:${participantId}`;
    const cached = await this.redis.get(key);
    if (cached !== null) return cached === RECORDING_CACHE_NONE ? null : cached;

    const rec = await this.recordingRepository.findOne({
      where: { sessionId, participantId, trackType: 'track' },
    });
    const recordingId = rec?.id ?? null;
    await this.redis.set(
      key,
      recordingId ?? RECORDING_CACHE_NONE,
      'EX',
      recordingId ? RECORDING_CACHE_HIT_TTL_SEC : RECORDING_CACHE_MISS_TTL_SEC,
    );
    return recordingId;
  }

  /**
   * Ingest a keypoint frame from the Redis Stream consumer.
   * Persists asynchronously via a batched buffer — never in the critical path.
   */
  async ingestKeypoints(data: PoseFrameDto): Promise<void> {
    const { sessionId, participantId, frameTimestampMs, keypoints, confidenceAvg } = data;

    const recordingId = await this.resolveRecordingId(sessionId, participantId);
    if (!recordingId) {
      this.logger.warn(
        `No track recording found for session=${sessionId} participant=${participantId} — skipping keypoint ingestion`,
      );
      return;
    }

    const frame = new PoseKeypointFrame();
    frame.recordingId = recordingId;
    frame.frameTimestampMs = frameTimestampMs;
    frame.keypoints = Object.fromEntries(
      keypoints.map((kp: Keypoint) => [kp.name, [kp.x, kp.y, kp.score]]),
    );
    frame.confidenceAvg = confidenceAvg;

    this.buffer.push(frame);
    if (this.buffer.length >= FLUSH_BATCH_SIZE) await this.flush();
    else this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush().catch((err) => {
      this.logger.error(`Pose frame flush failed: ${err instanceof Error ? err.message : err}`);
    }), FLUSH_INTERVAL_MS);
  }

  private async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.buffer.length === 0) return;
    const rows = this.buffer;
    this.buffer = [];
    await this.poseFrameRepository.insert(rows);
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
