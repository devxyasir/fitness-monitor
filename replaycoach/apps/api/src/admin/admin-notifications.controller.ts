import { Controller, Post, Get, UseGuards } from '@nestjs/common';

import type { AdminNotificationsResponse } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminElevatedGuard } from '../common/guards/admin-elevated.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '@replaycoach/types';
import { AdminNotificationsService } from './admin-notifications.service';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard, AdminElevatedGuard)
@Roles('platform_admin')
export class AdminNotificationsController {
  constructor(private readonly notificationsService: AdminNotificationsService) {}

  @Get()
  async getFeed(@CurrentUser() user: JwtPayload): Promise<AdminNotificationsResponse> {
    return this.notificationsService.getFeed(user.sub);
  }

  @Post('mark-seen')
  async markSeen(@CurrentUser() user: JwtPayload): Promise<{ lastSeenAt: string }> {
    return this.notificationsService.markSeen(user.sub);
  }
}
