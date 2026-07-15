import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import type { SessionRecordingDto } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionsGuard } from '../sessions/sessions.guard';
import { RecordingsService } from './recordings.service';

/** Post-session playback — "watch the session back" for a coach or student
 * after it ends. Nested under /sessions/:id so SessionsGuard's existing
 * coach/participant/org-admin-read access rules apply unchanged. */
@Controller('sessions/:id/recording')
@UseGuards(JwtAuthGuard, RolesGuard, SessionsGuard)
export class RecordingsController {
  constructor(private readonly recordingsService: RecordingsService) {}

  @Get()
  async get(@Param('id') sessionId: string): Promise<SessionRecordingDto> {
    return this.recordingsService.getSessionRecordingForPlayback(sessionId);
  }
}
