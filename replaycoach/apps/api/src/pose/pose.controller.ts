import {
  Controller,
  Get,
  Param,
  Query,
  ForbiddenException,
  NotFoundException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PoseService } from './pose.service';
import { Session } from '../sessions/session.entity';
import { SessionParticipant } from '../sessions/session-participant.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '@replaycoach/types';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class PoseController {
  constructor(
    private readonly poseService: PoseService,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(SessionParticipant)
    private readonly participantRepository: Repository<SessionParticipant>,
  ) {}

  /**
   * GET /sessions/:sessionId/pose/:participantId?startMs=&endMs=
   *
   * Retrieves stored pose keypoints for a participant's recording.
   * Access gated by same authorization as recording access (09 §8).
   */
  @Get(':sessionId/pose/:participantId')
  async getKeypoints(
    @Param('sessionId') sessionId: string,
    @Param('participantId') participantId: string,
    @Query('startMs') startMsRaw: string,
    @Query('endMs') endMsRaw: string,
    @Req() req: any,
  ) {
    const user: JwtPayload = req.user;

    // Authorization: verify the requester has access to this session
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const isCoach = session.coachId === user.sub;
    const isPlatformAdmin = user.role === 'platform_admin';

    if (!isCoach && !isPlatformAdmin) {
      // Check if requester is a participant
      const participant = await this.participantRepository.findOne({
        where: { sessionId, userId: user.sub },
      });

      if (!participant) {
        throw new ForbiddenException(
          'You do not have access to pose data for this session',
        );
      }
    }

    // Resolve the recording
    const recording = await this.poseService.getRecordingForParticipant(
      sessionId,
      participantId,
    );

    const startMs = parseInt(startMsRaw || '0', 10);
    const endMs = parseInt(endMsRaw || `${Number.MAX_SAFE_INTEGER}`, 10);

    const frames = await this.poseService.getKeypoints(
      recording.id,
      startMs,
      endMs,
    );

    return { frames };
  }
}
