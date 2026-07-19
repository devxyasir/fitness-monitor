import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { EmailLogListResponse } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminElevatedGuard } from '../common/guards/admin-elevated.guard';
import { EmailLogService } from '../email/email-log.service';
import { EmailLogListQueryDto } from './admin-email-log.dto';

@Controller('admin/email-logs')
@UseGuards(JwtAuthGuard, RolesGuard, AdminElevatedGuard)
@Roles('platform_admin')
export class AdminEmailLogController {
  constructor(private readonly emailLogService: EmailLogService) {}

  @Get()
  async list(@Query() query: EmailLogListQueryDto): Promise<EmailLogListResponse> {
    return this.emailLogService.list(query);
  }
}
