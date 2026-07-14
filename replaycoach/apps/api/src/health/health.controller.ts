import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createClient } from 'redis';

import type { HealthResponse } from '@replaycoach/types';

import { Public } from '../common/decorators/public.decorator';

const DEPENDENCY_TIMEOUT_MS = 2500;

interface DependencyStatus {
  status: 'ok' | 'error';
  detail?: string;
}

interface ReadinessResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
    poseService: DependencyStatus;
  };
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  /** Liveness — the process is up and answering HTTP. No dependency checks,
   * so this never flaps because Postgres/Redis/pose-service had a blip. */
  @Public()
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness — actually exercises the three things this API can't serve
   * traffic properly without: Postgres, Redis, and the pose-service. Used by
   * load balancers/orchestrators to gate traffic, not by uptime pings. */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const [database, redis, poseService] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkPoseService(),
    ]);

    const allOk = database.status === 'ok' && redis.status === 'ok' && poseService.status === 'ok';
    res.status(allOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies: { database, redis, poseService },
    };
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
    ]);
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    try {
      await this.withTimeout(this.dataSource.query('SELECT 1'), DEPENDENCY_TIMEOUT_MS);
      return { status: 'ok' };
    } catch (err) {
      return { status: 'error', detail: err instanceof Error ? err.message : 'unknown error' };
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const url = this.configService.get<string>('redis.url') ?? 'redis://localhost:6379';
    const client = createClient({ url, socket: { connectTimeout: DEPENDENCY_TIMEOUT_MS } });
    // Swallow connection errors here — we surface failure via the try/catch
    // below instead of an unhandled 'error' event crashing the process.
    client.on('error', () => {});
    try {
      await this.withTimeout(client.connect(), DEPENDENCY_TIMEOUT_MS);
      await this.withTimeout(client.ping(), DEPENDENCY_TIMEOUT_MS);
      return { status: 'ok' };
    } catch (err) {
      return { status: 'error', detail: err instanceof Error ? err.message : 'unknown error' };
    } finally {
      client.disconnect().catch(() => {});
    }
  }

  private async checkPoseService(): Promise<DependencyStatus> {
    const baseUrl = this.configService.get<string>('POSE_SERVICE_URL', 'http://localhost:8100');
    try {
      const res = await this.withTimeout(fetch(`${baseUrl}/ready`), DEPENDENCY_TIMEOUT_MS);
      if (!res.ok) return { status: 'error', detail: `pose-service returned ${res.status}` };
      return { status: 'ok' };
    } catch (err) {
      return { status: 'error', detail: err instanceof Error ? err.message : 'unknown error' };
    }
  }
}
