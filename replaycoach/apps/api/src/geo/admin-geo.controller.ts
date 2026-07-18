import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { GeoAccessLogListResponse } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminElevatedGuard } from '../common/guards/admin-elevated.guard';
import { GeoAccessLogListQueryDto } from './geo.dto';
import { GeoLogsService } from './geo-logs.service';

/** Geo *settings* live at PATCH /system-settings/geo-access (see
 * system-settings.controller.ts) — reusing the existing settings-page
 * aggregate/update pattern rather than a parallel one. This controller only
 * owns what's genuinely admin-panel-specific: the access-decision log. */
@Controller('admin/geo')
@UseGuards(JwtAuthGuard, RolesGuard, AdminElevatedGuard)
@Roles('platform_admin')
export class AdminGeoController {
  constructor(private readonly geoLogsService: GeoLogsService) {}

  @Get('logs')
  async listLogs(@Query() query: GeoAccessLogListQueryDto): Promise<GeoAccessLogListResponse> {
    return this.geoLogsService.list(query);
  }
}
