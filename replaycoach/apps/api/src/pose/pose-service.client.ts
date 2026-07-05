import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Publishes start/stop commands to a Redis stream that any number of
 * pose-service replicas consume competitively (consumer group `pose-workers`),
 * instead of calling one fixed instance's HTTP endpoint directly. This lets
 * workers spread across machines — add capacity by adding replicas
 * (FIX_07 §3a). The pose-service's direct HTTP endpoints still exist
 * separately for local/dev debugging.
 */
@Injectable()
export class PoseServiceClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PoseServiceClient.name);
  private static readonly COMMAND_STREAM = 'pose:commands';
  private redis!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('redis.url', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);
    this.redis.on('error', (err) => {
      this.logger.error(`Pose command Redis error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }

  /** Non-fatal: a pose failure must never break live video or recording. */
  async startWorker(sessionId: string, participantId: string): Promise<void> {
    await this.publishCommand('start', sessionId, participantId);
  }
  async stopWorker(sessionId: string, participantId: string): Promise<void> {
    await this.publishCommand('stop', sessionId, participantId);
  }

  private async publishCommand(
    action: 'start' | 'stop',
    sessionId: string,
    participantId: string,
  ): Promise<void> {
    try {
      await this.redis.xadd(
        PoseServiceClient.COMMAND_STREAM,
        '*',
        'data',
        JSON.stringify({ action, sessionId, participantId }),
      );
    } catch (err) {
      this.logger.warn(
        `pose ${action} command publish failed (non-fatal): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
