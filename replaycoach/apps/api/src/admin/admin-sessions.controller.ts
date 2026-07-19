import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';

import type { AdminSessionDto, AdminSessionListResponse, JwtPayload } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminElevatedGuard } from '../common/guards/admin-elevated.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SessionsService } from '../sessions/sessions.service';
import type { Session } from '../sessions/session.entity';
import { AuditService } from '../audit/audit.service';
import { AdminSessionListQueryDto } from './admin-sessions.dto';
import { HideContentDto } from './admin-content.dto';

@Controller('admin/sessions')
@UseGuards(JwtAuthGuard, RolesGuard, AdminElevatedGuard)
@Roles('platform_admin')
export class AdminSessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly auditService: AuditService,
  ) {}

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

  /** Content oversight — hides a session (and cascades to its clips at
   * read time, see ClipsService.assertClipAccess) from everyone except
   * platform_admin. Force-tears-down a still-live session's LiveKit room. */
  @Post(':id/hide')
  async hide(
    @Param('id') id: string,
    @Body() dto: HideContentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminSessionDto> {
    const session = await this.sessionsService.setHidden(id, true, dto.reason, user.sub);
    void this.auditService.record(user.sub, 'session.hidden_changed', 'session', id, {
      hidden: true,
      reason: dto.reason,
    });
    return this.toAdminDto(session);
  }

  @Post(':id/unhide')
  @HttpCode(HttpStatus.OK)
  async unhide(@Param('id') id: string, @CurrentUser() user: JwtPayload): Promise<AdminSessionDto> {
    const session = await this.sessionsService.setHidden(id, false, null, user.sub);
    void this.auditService.record(user.sub, 'session.hidden_changed', 'session', id, { hidden: false });
    return this.toAdminDto(session);
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
      hidden: session.hidden,
      hiddenReason: session.hiddenReason,
      hiddenAt: session.hiddenAt ? session.hiddenAt.toISOString() : null,
    };
  }
}
