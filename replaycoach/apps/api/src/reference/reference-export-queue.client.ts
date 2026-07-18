import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface ExportJobPayload {
  jobId: string;
  refId: string;
  videoUrl: string;
  keypointsUrl: string;
  uploadUrl: string;
  callbackUrl: string;
  progressUrl: string;
  callbackToken: string;
  keypointFormat: string;
  includeSkeleton: boolean;
  includeAnnotations: boolean;
  annotations: Array<{
    shapeType: string;
    startJoint: string;
    endJoint: string | null;
    midJoint: string | null;
    color: string;
    thickness: number;
    label: string | null;
    fromFrame: number;
    untilFrame: number | null;
  }>;
}

/**
 * Publishes video-export jobs to a Redis stream that a dedicated pose-service
 * export worker process consumes (see apps/pose-service/export_worker.py) —
 * mirrors PoseServiceClient's exact pattern (same stream-per-concern split,
 * same ioredis usage), applied to export instead of live start/stop
 * commands. This is what makes export durable (survives a worker crash/
 * restart — the job just waits in the stream) and gives it real process-
 * level isolation from live pose inference, which the previous direct
 * fetch() to POST /reference/export (a FastAPI BackgroundTask in the SAME
 * process as live tracking) never had.
 */
@Injectable()
export class ReferenceExportQueueClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReferenceExportQueueClient.name);
  private static readonly EXPORT_STREAM = 'pose:export-jobs';
  private redis!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('redis.url', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);
    this.redis.on('error', (err) => {
      this.logger.error(`Export queue Redis error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }

  /**
   * Throws on publish failure (unlike PoseServiceClient's live start/stop
   * commands, which are best-effort/non-fatal) — an export job that never
   * makes it onto the stream must not silently report "accepted" to the
   * coach with nothing ever going to render it.
   */
  async enqueueExport(job: ExportJobPayload): Promise<void> {
    await this.redis.xadd(ReferenceExportQueueClient.EXPORT_STREAM, '*', 'data', JSON.stringify(job));
  }
}
