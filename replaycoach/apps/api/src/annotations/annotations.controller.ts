import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionsGuard } from '../sessions/sessions.guard';
import { AnnotationsService } from './annotations.service';
import { Annotation } from '../database/entities/others.entities';

@Controller()
@UseGuards(JwtAuthGuard)
export class AnnotationsController {
  constructor(private readonly annotationsService: AnnotationsService) {}

  @Get('sessions/:id/annotations')
  @UseGuards(RolesGuard, SessionsGuard)
  async getSessionAnnotations(@Param('id') sessionId: string): Promise<Annotation[]> {
    return this.annotationsService.getAnnotationsBySession(sessionId);
  }

  @Get('clips/:clipId/annotations')
  async getClipAnnotations(@Param('clipId') clipId: string): Promise<Annotation[]> {
    return this.annotationsService.getAnnotationsByClip(clipId);
  }
}
