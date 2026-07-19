import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { HealthResponse, ReadinessResponse } from '@replaycoach/types';

import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

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

  /** Readiness — actually exercises the things this API can't serve traffic
   * properly without: Postgres, Redis, the pose-service, and LiveKit. Used
   * by load balancers/orchestrators to gate traffic, not by uptime pings. */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const { response, allOk } = await this.healthService.getReadiness();
    res.status(allOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return response;
  }
}
