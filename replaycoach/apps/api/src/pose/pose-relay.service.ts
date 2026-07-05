import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { PoseService } from './pose.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { PoseFrameDto } from '@replaycoach/types';

/**
 * Redis Stream consumer that reads keypoint frames published by the
 * Python pose-service and:
 *  1. Forwards them to clients via the WebSocket gateway (live overlay)
 *  2. Persists them to the database (replay overlay)
 *
 * Circuit breaker: stops forwarding for a track after consecutive failures.
 */
@Injectable()
export class PoseRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PoseRelayService.name);
  private redis!: Redis;
  private running = false;
  private readonly streamKey: string;
  private readonly groupName = 'pose-relay-group';
  private readonly consumerName: string;

  // Circuit breaker state per participant
  private readonly failureCounts = new Map<string, number>();
  private static readonly MAX_FAILURES = 5;

  constructor(
    private readonly configService: ConfigService,
    private readonly poseService: PoseService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {
    this.streamKey = 'pose:keypoints';
    this.consumerName = `relay-${process.pid}`;
  }

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('redis.url', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);

    this.redis.on('error', (err) => {
      this.logger.error(`Redis client connection error: ${err.message}`);
    });

    // Create consumer group (ignore error if it already exists)
    try {
      await this.redis.xgroup('CREATE', this.streamKey, this.groupName, '0', 'MKSTREAM');
      this.logger.log(`Created Redis consumer group "${this.groupName}" on stream "${this.streamKey}"`);
    } catch (err: any) {
      if (!err.message?.includes('BUSYGROUP')) {
        this.logger.error(`Failed to create consumer group: ${err.message}`);
      }
    }

    this.running = true;
    this.consumeLoop().catch((err) => {
      this.logger.error(`Consumer loop crashed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.redis) {
      await this.redis.quit();
    }
  }

  private async consumeLoop(): Promise<void> {
    this.logger.log('Pose relay consumer loop started');

    while (this.running) {
      try {
        const results: any = await this.redis.xreadgroup(
          'GROUP',
          this.groupName,
          this.consumerName,
          'COUNT',
          '10',
          'BLOCK',
          '2000',
          'STREAMS',
          this.streamKey,
          '>',
        );

        if (!results || results.length === 0) {
          continue;
        }

        for (let s = 0; s < results.length; s++) {
          const messages = results[s][1];
          for (let m = 0; m < messages.length; m++) {
            const messageId = messages[m][0] as string;
            const fields = messages[m][1] as string[];
            await this.processMessage(messageId, fields);
          }
        }
      } catch (err: any) {
        if (this.running) {
          this.logger.error(`Consumer loop error: ${err.message}`);
          // Brief backoff before retry
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    this.logger.log('Pose relay consumer loop stopped');
  }

  private async processMessage(messageId: string, fields: string[]): Promise<void> {
    try {
      // Fields are [key, value, key, value, ...]
      const dataIndex = fields.indexOf('data');
      if (dataIndex === -1 || dataIndex + 1 >= fields.length) {
        await this.redis.xack(this.streamKey, this.groupName, messageId);
        return;
      }

      const raw = fields[dataIndex + 1];
      if (!raw) {
        await this.redis.xack(this.streamKey, this.groupName, messageId);
        return;
      }

      const data: PoseFrameDto = JSON.parse(raw);
      const trackKey = `${data.sessionId}:${data.participantId}`;

      // Circuit breaker check
      const failures = this.failureCounts.get(trackKey) ?? 0;
      if (failures >= PoseRelayService.MAX_FAILURES) {
        // Silently drop — circuit is open for this track
        await this.redis.xack(this.streamKey, this.groupName, messageId);
        return;
      }

      // 1. Forward to WebSocket clients (live overlay)
      try {
        this.realtimeGateway.emitPoseUpdate(
          data.sessionId,
          data.participantId,
          data,
        );
        // Reset failure count on success
        this.failureCounts.set(trackKey, 0);
      } catch (err: any) {
        this.logger.warn(`Failed to emit pose:update for ${trackKey}: ${err.message}`);
        this.failureCounts.set(trackKey, failures + 1);

        if (failures + 1 >= PoseRelayService.MAX_FAILURES) {
          this.logger.warn(
            `Circuit breaker opened for track ${trackKey} after ${PoseRelayService.MAX_FAILURES} failures`,
          );
        }
      }

      // 2. Persist to database (async, non-blocking)
      this.poseService.ingestKeypoints(data).catch((err) => {
        this.logger.error(`Failed to persist keypoints for ${trackKey}: ${err.message}`);
      });

      // ACK the message
      await this.redis.xack(this.streamKey, this.groupName, messageId);
    } catch (err: any) {
      this.logger.error(`Failed to process message ${messageId}: ${err.message}`);
      await this.redis.xack(this.streamKey, this.groupName, messageId);
    }
  }
}
