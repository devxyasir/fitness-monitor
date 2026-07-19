import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createClient } from 'redis';

import type { DependencyStatus, ReadinessResponse } from '@replaycoach/types';

import { LiveKitService } from '../media/livekit.service';

const DEPENDENCY_TIMEOUT_MS = 2500;

/**
 * Extracted from HealthController's own inline checks (previously all four
 * — well, three, before LiveKit was added here — lived directly in the
 * controller). Now reused by both the public, unauthenticated
 * GET /health/ready (load balancers/orchestrators) and the admin-only
 * GET /admin/status/dependencies (the new service status panel) — same
 * checks, same behavior, one implementation.
 */
@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly liveKitService: LiveKitService,
  ) {}

  async getReadiness(): Promise<{ response: ReadinessResponse; allOk: boolean }> {
    const [database, redis, poseService, liveKit] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkPoseService(),
      this.checkLiveKit(),
    ]);

    const allOk =
      database.status === 'ok' && redis.status === 'ok' && poseService.status === 'ok' && liveKit.status === 'ok';

    return {
      response: {
        status: allOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        dependencies: { database, redis, poseService, liveKit },
      },
      allOk,
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

  private async checkLiveKit(): Promise<DependencyStatus> {
    try {
      const result = await this.withTimeout(this.liveKitService.healthCheck(), DEPENDENCY_TIMEOUT_MS);
      return result.ok
        ? { status: 'ok' }
        : { status: 'error', detail: result.detail ?? 'LiveKit health check failed' };
    } catch (err) {
      return { status: 'error', detail: err instanceof Error ? err.message : 'unknown error' };
    }
  }
}
