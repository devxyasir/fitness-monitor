import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import type { JwtPayload } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionsGuard } from '../sessions/sessions.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnnotationsService } from './annotations.service';
import { ClipsService } from '../clips/clips.service';
import { Annotation } from '../database/entities/others.entities';

@Controller()
@UseGuards(JwtAuthGuard)
export class AnnotationsController {
  constructor(
    private readonly annotationsService: AnnotationsService,
    private readonly clipsService: ClipsService,
  ) {}

  @Get('sessions/:id/annotations')
  @UseGuards(RolesGuard, SessionsGuard)
  async getSessionAnnotations(@Param('id') sessionId: string): Promise<Annotation[]> {
    return this.annotationsService.getAnnotationsBySession(sessionId);
  }

  @Get('clips/:clipId/annotations')
  async getClipAnnotations(
    @Param('clipId') clipId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<Annotation[]> {
    // Previously had no ownership check at all — any authenticated user
    // could read any clip's annotations by ID. Reuses the same IDOR check
    // ClipsService.getClip() already enforces for the clip itself.
    await this.clipsService.assertClipAccess(clipId, user.sub, user.role);
    return this.annotationsService.getAnnotationsByClip(clipId);
  }
}
