import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import type { JwtPayload, SessionStatus } from '@replaycoach/types';
import { Session } from './session.entity';
import { SessionParticipant } from './session-participant.entity';
import { CreateSessionDto, UpdateSessionDto } from './session.dto';
import { User } from '../users/user.entity';
import { EgressService } from '../media/egress.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(SessionParticipant)
    private readonly participantRepository: Repository<SessionParticipant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly egressService: EgressService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(coachId: string, orgId: string | null, dto: CreateSessionDto): Promise<Session> {
    const livekitRoomName = `room-${uuidv4()}`;
    const session = new Session();
    session.coachId = coachId;
    session.orgId = orgId;
    session.livekitRoomName = livekitRoomName;
    session.scheduledAt = new Date(dto.scheduledAt);
    session.retentionDays = dto.retentionDays ?? 90;
    session.accessType = dto.accessType ?? 'public';
    session.inviteCode = uuidv4();

    if (dto.isInstant) {
      session.status = 'live';
      session.startedAt = new Date();
    } else {
      session.status = 'scheduled';
    }

    const savedSession = await this.sessionRepository.save(session);

    // Coach is automatically added as a participant too
    await this.join(savedSession.id, coachId, 'coach');

    if (dto.isInstant) {
      await this.startCompositeRecording(savedSession.id);
    }

    return savedSession;
  }

  async findById(id: string): Promise<Session | null> {
    return this.sessionRepository.findOne({
      where: { id },
      relations: ['coach', 'organization', 'participants', 'participants.user'],
    });
  }

  async findByInviteCode(inviteCode: string): Promise<Session | null> {
    return this.sessionRepository.findOne({
      where: { inviteCode },
      relations: ['coach', 'organization', 'participants', 'participants.user'],
    });
  }

  async isParticipant(sessionId: string, userId: string): Promise<boolean> {
    const count = await this.participantRepository.count({
      where: { sessionId, userId, status: 'approved', leftAt: IsNull() },
    });
    return count > 0;
  }

  async getPendingParticipants(sessionId: string): Promise<SessionParticipant[]> {
    return this.participantRepository.find({
      where: { sessionId, status: 'pending' },
      relations: ['user'],
    });
  }

  async approveParticipant(sessionId: string, userId: string): Promise<SessionParticipant> {
    const participant = await this.participantRepository.findOne({
      where: { sessionId, userId },
      relations: ['user'],
    });
    if (!participant) {
      throw new NotFoundException(`Participant not found in session ${sessionId}`);
    }
    participant.status = 'approved';
    return this.participantRepository.save(participant);
  }

  async rejectParticipant(sessionId: string, userId: string): Promise<SessionParticipant> {
    const participant = await this.participantRepository.findOne({
      where: { sessionId, userId },
      relations: ['user'],
    });
    if (!participant) {
      throw new NotFoundException(`Participant not found in session ${sessionId}`);
    }
    participant.status = 'rejected';
    return this.participantRepository.save(participant);
  }

  async findAll(user: JwtPayload): Promise<Session[]> {
    if (user.role === 'platform_admin') {
      return this.sessionRepository.find({
        order: { scheduledAt: 'DESC' },
      });
    }

    if (user.role === 'studio_admin') {
      if (!user.orgId) {
        return [];
      }
      return this.sessionRepository.find({
        where: { orgId: user.orgId },
        order: { scheduledAt: 'DESC' },
      });
    }

    if (user.role === 'coach') {
      return this.sessionRepository.find({
        where: { coachId: user.sub },
        order: { scheduledAt: 'DESC' },
      });
    }

    // Students see sessions they are active participants in
    return this.sessionRepository
      .createQueryBuilder('session')
      .innerJoin('session.participants', 'participant')
      .where('participant.userId = :userId', { userId: user.sub })
      .andWhere('participant.status = :status', { status: 'approved' })
      .andWhere('participant.leftAt IS NULL')
      .orderBy('session.scheduledAt', 'DESC')
      .getMany();
  }

  async update(id: string, dto: UpdateSessionDto): Promise<Session> {
    const session = await this.findById(id);
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    if (session.status !== 'scheduled') {
      throw new BadRequestException('Can only update session details when in scheduled state');
    }

    if (dto.scheduledAt) {
      session.scheduledAt = new Date(dto.scheduledAt);
    }
    if (dto.retentionDays !== undefined) {
      session.retentionDays = dto.retentionDays;
    }
    if (dto.accessType) {
      session.accessType = dto.accessType;
    }

    return this.sessionRepository.save(session);
  }

  async updateStatus(id: string, newStatus: SessionStatus): Promise<Session> {
    const session = await this.findById(id);
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    const currentStatus = session.status;
    if (currentStatus === newStatus) {
      return session;
    }

    // Lifecycle state transition matrix validation
    const allowed = this.validateTransition(currentStatus, newStatus);
    if (!allowed) {
      throw new BadRequestException(
        `Invalid status transition from '${currentStatus}' to '${newStatus}'`,
      );
    }

    session.status = newStatus;

    if (newStatus === 'live') {
      session.startedAt = new Date();
    } else if (newStatus === 'ended') {
      session.endedAt = new Date();
    }

    const savedSession = await this.sessionRepository.save(session);

    if (newStatus === 'live') {
      await this.startCompositeRecording(savedSession.id);
    } else if (newStatus === 'ended') {
      await this.egressService.stopSessionEgress(savedSession.id);
    }

    return savedSession;
  }

  async join(sessionId: string, userId: string, roleInSession: 'coach' | 'student'): Promise<SessionParticipant> {
    const userExists = await this.userRepository.count({ where: { id: userId } });
    if (!userExists) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    if (['ended', 'processed', 'archived'].includes(session.status)) {
      throw new BadRequestException('This coaching session has already ended and is no longer active.');
    }

    let participant = await this.participantRepository.findOne({
      where: { sessionId, userId },
    });

    let targetStatus: 'pending' | 'approved' | 'rejected' = 'approved';
    if (roleInSession !== 'coach') {
      if (session.accessType === 'lobby') {
        targetStatus = participant?.status === 'approved' ? 'approved' : 'pending';
      }
    }

    if (participant) {
      participant.leftAt = null;
      participant.roleInSession = roleInSession;
      participant.joinedAt = new Date();
      participant.status = targetStatus;
    } else {
      participant = new SessionParticipant();
      participant.sessionId = sessionId;
      participant.userId = userId;
      participant.roleInSession = roleInSession;
      participant.status = targetStatus;
    }

    return this.participantRepository.save(participant);
  }

  async leave(sessionId: string, userId: string): Promise<SessionParticipant> {
    const participant = await this.participantRepository.findOne({
      where: { sessionId, userId, leftAt: IsNull() },
    });

    if (!participant) {
      throw new NotFoundException(`Active session participant with user ID ${userId} not found in session ${sessionId}`);
    }

    participant.leftAt = new Date();
    return this.participantRepository.save(participant);
  }

  private validateTransition(from: SessionStatus, to: SessionStatus): boolean {
    const validTransitions: Record<SessionStatus, SessionStatus[]> = {
      scheduled: ['live'],
      live: ['ended'],
      ended: ['processed'],
      processed: ['archived'],
      archived: [],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  private async startCompositeRecording(sessionId: string): Promise<void> {
    const result = await this.egressService.startRoomComposite(sessionId);
    if (result.status === 'recording') {
      this.realtimeGateway.emitRecordingActive(sessionId);
      return;
    }

    this.realtimeGateway.emitRecordingDegraded(
      sessionId,
      result.degradedReason ?? 'LiveKit egress did not start',
    );
  }
}
