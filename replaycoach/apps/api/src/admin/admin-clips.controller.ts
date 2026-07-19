import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';

import type { AdminClipDto, AdminClipListResponse, JwtPayload } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminElevatedGuard } from '../common/guards/admin-elevated.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClipsService } from '../clips/clips.service';
import type { Clip } from '../database/entities/others.entities';
import { AuditService } from '../audit/audit.service';
import { AdminClipListQueryDto } from './admin-clips.dto';
import { HideContentDto } from './admin-content.dto';

/**
 * Content oversight for clips — the "content" half of Admin Phase 2's
 * flag/hide feature (sessions are covered by AdminSessionsController).
 * No dedicated /admin/clips existed before this; the Clips page itself
 * (apps/web/app/(dashboard)) has no cross-org admin view.
 */
@Controller('admin/clips')
@UseGuards(JwtAuthGuard, RolesGuard, AdminElevatedGuard)
@Roles('platform_admin')
export class AdminClipsController {
  constructor(
    private readonly clipsService: ClipsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async list(@Query() query: AdminClipListQueryDto): Promise<AdminClipListResponse> {
    const { items, total, page, pageSize } = await this.clipsService.findAllForAdmin(
      { sessionId: query.sessionId, orgId: query.orgId, hidden: query.hidden, since: query.since, until: query.until },
      query.page ?? 1,
      query.pageSize ?? 20,
    );

    return {
      items: items.map((clip) => this.toAdminDto(clip)),
      total,
      page,
      pageSize,
    };
  }

  @Post(':id/hide')
  async hide(
    @Param('id') id: string,
    @Body() dto: HideContentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminClipDto> {
    const clip = await this.clipsService.setHidden(id, true, dto.reason, user.sub);
    void this.auditService.record(user.sub, 'clip.hidden_changed', 'clip', id, {
      hidden: true,
      reason: dto.reason,
    });
    return this.toAdminDto(clip);
  }

  @Post(':id/unhide')
  @HttpCode(HttpStatus.OK)
  async unhide(@Param('id') id: string, @CurrentUser() user: JwtPayload): Promise<AdminClipDto> {
    const clip = await this.clipsService.setHidden(id, false, null, user.sub);
    void this.auditService.record(user.sub, 'clip.hidden_changed', 'clip', id, { hidden: false });
    return this.toAdminDto(clip);
  }

  private toAdminDto(clip: Clip): AdminClipDto {
    return {
      id: clip.id,
      title: clip.title,
      sessionId: clip.sessionId,
      orgId: clip.session?.orgId ?? null,
      orgName: clip.session?.organization?.name ?? null,
      createdBy: clip.createdBy,
      creatorName: clip.creator?.displayName ?? 'Unknown',
      clipType: clip.clipType,
      startMs: clip.startMs,
      endMs: clip.endMs,
      createdAt: clip.createdAt.toISOString(),
      hidden: clip.hidden,
      hiddenReason: clip.hiddenReason,
      hiddenAt: clip.hiddenAt ? clip.hiddenAt.toISOString() : null,
      sessionHidden: clip.session?.hidden ?? false,
    };
  }
}
