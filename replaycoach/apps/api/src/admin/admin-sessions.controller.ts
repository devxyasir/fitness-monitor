import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { AdminSessionDto, AdminSessionListResponse } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminElevatedGuard } from '../common/guards/admin-elevated.guard';
import { SessionsService } from '../sessions/sessions.service';
import type { Session } from '../sessions/session.entity';
import { AdminSessionListQueryDto } from './admin-sessions.dto';

@Controller('admin/sessions')
@UseGuards(JwtAuthGuard, RolesGuard, AdminElevatedGuard)
@Roles('platform_admin')
export class AdminSessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /** Force-ending a session needs no dedicated endpoint here — SessionsGuard
   * already grants platform_admin full access to the existing
   * PATCH /sessions/:id/status, which runs the full transition validation,
   * egress teardown, and LiveKit room deletion. This controller only adds
   * the paginated, filterable cross-org listing that findAll() lacks. */
  @Get()
  async list(@Query() query: AdminSessionListQueryDto): Promise<AdminSessionListResponse> {
    const { items, total, page, pageSize } = await this.sessionsService.findAllForAdmin(
      { status: query.status, orgId: query.orgId, coachId: query.coachId, since: query.since, until: query.until },
      query.page ?? 1,
      query.pageSize ?? 20,
    );

    return {
      items: items.map((session) => this.toAdminDto(session)),
      total,
      page,
      pageSize,
    };
  }

  private toAdminDto(session: Session): AdminSessionDto {
    return {
      id: session.id,
      coachId: session.coachId,
      orgId: session.orgId,
      status: session.status,
      accessType: session.accessType,
      inviteCode: session.inviteCode,
      livekitRoomName: session.livekitRoomName,
      scheduledAt: session.scheduledAt.toISOString(),
      startedAt: session.startedAt ? session.startedAt.toISOString() : null,
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      retentionDays: session.retentionDays,
      coachName: session.coach?.displayName ?? 'Unknown',
      orgName: session.organization?.name ?? null,
      participantCount: (session as unknown as { participantCount: number }).participantCount ?? 0,
    };
  }
}
