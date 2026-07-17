import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { AuditLogListResponse } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminElevatedGuard } from '../common/guards/admin-elevated.guard';
import { AuditService } from '../audit/audit.service';
import { AuditLogListQueryDto } from './admin-audit.dto';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard, AdminElevatedGuard)
@Roles('platform_admin')
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(@Query() query: AuditLogListQueryDto): Promise<AuditLogListResponse> {
    return this.auditService.list(query);
  }
}
