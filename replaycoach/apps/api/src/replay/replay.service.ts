import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Session } from '../sessions/session.entity';
import { ReplayEvent } from '../database/entities/others.entities';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class ReplayService {
  private readonly logger = new Logger(ReplayService.name);

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(ReplayEvent)
    private readonly replayEventRepository: Repository<ReplayEvent>,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Ensure session exists, is live, and the caller is the coach.
   */
  private async getAndVerifyCoachSession(sessionId: string, coachId: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });

    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.coachId !== coachId) throw new ForbiddenException('Only the session coach can control replays');
    if (session.status !== 'live') throw new UnprocessableEntityException('Replays are only available during live sessions');

    return session;
  }

  /**
   * Broadcast a buffer-based replay start to all participants in the session.
   * participantId: target student participant ID to replay
   * fromOffsetMs: negative — e.g. -30000 means "last 30 seconds"
   * toOffsetMs: 0 means "up to right now"
   */
  async seekReplay(
    sessionId: string,
    coachId: string,
    participantId: string,
    fromOffsetMs: number,
    toOffsetMs: number = 0,
  ): Promise<{ success: boolean; fromOffsetMs: number; toOffsetMs: number }> {
    await this.getAndVerifyCoachSession(sessionId, coachId);

    if (fromOffsetMs >= 0) {
      throw new UnprocessableEntityException('fromOffsetMs must be negative (e.g. -30000 for last 30s)');
    }

    // Broadcast socket event — each client assembles its own local blob URL
    this.realtimeGateway.emitBufferReplay(sessionId, participantId, fromOffsetMs, toOffsetMs);

    // Audit log
    try {
      const replayEvent = new ReplayEvent();
      replayEvent.sessionId = sessionId;
      replayEvent.initiatedBy = coachId;
      replayEvent.targetParticipantId = participantId;
      replayEvent.seekTimestampMs = fromOffsetMs;
      replayEvent.sharedWithUserIds = [participantId];
      await this.replayEventRepository.save(replayEvent);
    } catch (err: any) {
      this.logger.error(`Failed to audit ReplayEvent: ${err.message ?? err}`);
    }

    return { success: true, fromOffsetMs, toOffsetMs };
  }

  /**
   * End active replay for all session participants and return them to live.
   */
  async endReplay(
    sessionId: string,
    coachId: string,
  ): Promise<{ success: boolean }> {
    await this.getAndVerifyCoachSession(sessionId, coachId);

    this.realtimeGateway.emitBufferReplayEnd(sessionId);

    return { success: true };
  }

  /**
   * Sync seek actions from the coach's replay player to the targeted students.
   */
  async targetReplay(
    sessionId: string,
    coachId: string,
    studentIds: string[],
    timestampMs: number,
  ): Promise<{ success: boolean }> {
    await this.getAndVerifyCoachSession(sessionId, coachId);

    if (!studentIds || studentIds.length === 0) {
      throw new UnprocessableEntityException('studentIds cannot be empty');
    }

    this.realtimeGateway.emitReplaySeek(sessionId, studentIds, { timestampMs });

    return { success: true };
  }
}
