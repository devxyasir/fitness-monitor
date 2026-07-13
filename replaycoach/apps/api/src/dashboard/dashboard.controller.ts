import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '@replaycoach/types';

import { DashboardService } from './dashboard.service';
import type { DashboardRange } from './dashboard.dto';

const VALID_RANGES: DashboardRange[] = ['7d', '30d', '90d'];

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('coach/overview')
  @Roles('coach', 'studio_admin', 'platform_admin')
  async coachOverview(@CurrentUser() user: JwtPayload, @Query('range') range?: string) {
    const safeRange: DashboardRange = VALID_RANGES.includes(range as DashboardRange)
      ? (range as DashboardRange)
      : '30d';
    return this.dashboardService.getCoachOverview(user.sub, safeRange);
  }

  @Get('student/overview')
  @Roles('student')
  async studentOverview(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getStudentOverview(user.sub);
  }
}
