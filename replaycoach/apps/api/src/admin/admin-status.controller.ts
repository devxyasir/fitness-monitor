import { Controller, Get, UseGuards } from '@nestjs/common';

import type { ReadinessResponse, StorageOverviewDto } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminElevatedGuard } from '../common/guards/admin-elevated.guard';
import { HealthService } from '../health/health.service';
import { AdminStorageService } from './admin-storage.service';

/** Admin-authenticated mirror of the public GET /health/ready check (same
 * HealthService, same four dependency probes) plus storage totals — the
 * two halves of the "service status panel" item, sharing one admin page. */
@Controller('admin/status')
@UseGuards(JwtAuthGuard, RolesGuard, AdminElevatedGuard)
@Roles('platform_admin')
export class AdminStatusController {
  constructor(
    private readonly healthService: HealthService,
    private readonly adminStorageService: AdminStorageService,
  ) {}

  @Get('dependencies')
  async getDependencies(): Promise<ReadinessResponse> {
    const { response } = await this.healthService.getReadiness();
    return response;
  }

  @Get('storage')
  async getStorage(): Promise<StorageOverviewDto> {
    return this.adminStorageService.getOverview();
  }
}
