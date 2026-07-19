import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionsGuard } from './sessions.guard';
import { SessionsService } from './sessions.service';
import { LiveKitService, liveKitRoomName } from '../media/livekit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateSessionDto, UpdateSessionDto } from './session.dto';
import type { JwtPayload, SessionStatus } from '@replaycoach/types';
import { AuditService } from '../audit/audit.service';

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly livekitService: LiveKitService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @Roles('coach', 'studio_admin', 'platform_admin')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionsService.create(user.sub, user.orgId, dto);
  }

  @Get()
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.sessionsService.findAll(user);
  }

  @Get('by-invite/:inviteCode')
  async findByInviteCode(@Param('inviteCode') inviteCode: string) {
    const session = await this.sessionsService.findByInviteCode(inviteCode);
    // This route has no :id param, so SessionsGuard (which checks `hidden`)
    // never runs on it — it isn't even attached via @UseGuards(SessionsGuard).
    // A hidden session must not be previewable by invite code either, so
    // the check is inlined here. 404 (not 403): there's no resource id in
    // the URL to disambiguate "hidden" from "doesn't exist" for a caller
    // that isn't authorized to know the difference.
    if (!session || session.hidden) {
      throw new NotFoundException(`Session not found`);
    }
    return session;
  }

  @Get(':id')
  @UseGuards(SessionsGuard)
  async findById(@Param('id') id: string) {
    return this.sessionsService.findById(id);
  }

  @Patch(':id')
  @UseGuards(SessionsGuard)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    // Only the coach of the session or a platform admin can update parameters
    const session = await this.sessionsService.findById(id);
    if (!session) {
      throw new ForbiddenException('Session not found or unavailable');
    }
    if (session.coachId !== user.sub && user.role !== 'platform_admin') {
      throw new ForbiddenException('Only the session coach or a platform admin can update this session');
    }
    return this.sessionsService.update(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(SessionsGuard)
  async updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('status') status: SessionStatus,
  ) {
    // Only the coach of the session or a platform admin can transition status
    const session = await this.sessionsService.findById(id);
    if (!session) {
      throw new ForbiddenException('Session not found or unavailable');
    }
    if (session.coachId !== user.sub && user.role !== 'platform_admin') {
      throw new ForbiddenException('Only the session coach or a platform admin can change the session status');
    }
    const updated = await this.sessionsService.updateStatus(id, status);
    if (status === 'ended') {
      this.realtimeGateway.emitSessionTerminated(id);
    }
    // Audit only the genuine "admin acting on someone else's session" case —
    // a coach ending their own session is ordinary usage, not an admin
    // action, and would otherwise flood the log with non-admin noise.
    if (user.role === 'platform_admin' && session.coachId !== user.sub) {
      void this.auditService.record(user.sub, 'session.force_status_change', 'session', id, {
        from: session.status,
        to: status,
      });
    }
    return updated;
  }

  @Get(':id/lobby/pending')
  @UseGuards(SessionsGuard)
  async getPending(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const session = await this.sessionsService.findById(id);
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }
    if (session.coachId !== user.sub && user.role !== 'platform_admin') {
      throw new ForbiddenException('Only the coach can view pending lobby requests');
    }
    return this.sessionsService.getPendingParticipants(id);
  }

  @Post(':id/lobby/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionsGuard)
  async approve(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('userId') userId: string,
  ) {
    const session = await this.sessionsService.findById(id);
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }
    if (session.coachId !== user.sub && user.role !== 'platform_admin') {
      throw new ForbiddenException('Only the coach can approve lobby requests');
    }
    const participant = await this.sessionsService.approveParticipant(id, userId);

    // Notify student via socket
    this.realtimeGateway.emitLobbyApproved(id, userId);

    return participant;
  }

  @Post(':id/lobby/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionsGuard)
  async reject(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('userId') userId: string,
  ) {
    const session = await this.sessionsService.findById(id);
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }
    if (session.coachId !== user.sub && user.role !== 'platform_admin') {
      throw new ForbiddenException('Only the coach can reject lobby requests');
    }
    const participant = await this.sessionsService.rejectParticipant(id, userId);

    // Notify student via socket
    this.realtimeGateway.emitLobbyRejected(id, userId);

    return participant;
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionsGuard)
  async join(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const roleInSession = user.role === 'coach' ? 'coach' : 'student';
    const participant = await this.sessionsService.join(id, user.sub, roleInSession);

    if (participant.status === 'pending') {
      // Notify coach via socket
      this.realtimeGateway.emitLobbyRequest(id, {
        id: participant.id,
        sessionId: id,
        userId: user.sub,
        roleInSession,
        status: 'pending',
        user: {
          id: user.sub,
          email: user.email,
        },
      });

      return {
        participant,
        token: null,
        url: null,
        status: 'pending',
      };
    }

    if (participant.status === 'rejected') {
      throw new ForbiddenException('Your join request has been declined.');
    }

    const roomName = liveKitRoomName(id);
    const token = await this.livekitService.generateToken(
      roomName,
      user.sub,
      user.email,
      roleInSession,
    );
    return {
      participant,
      token,
      url: this.livekitService.getLiveKitUrl(),
      status: 'approved',
    };
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionsGuard)
  async leave(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.sessionsService.leave(id, user.sub);
  }

  /** Host control: coach forcibly removes a participant from the live
   * meeting. Disconnects their WebRTC session immediately (LiveKit) and
   * marks them as left (same bookkeeping as a normal leave) — they can
   * still rejoin afterward like anyone else, this isn't a ban. */
  @Post(':id/participants/:userId/remove')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionsGuard)
  async removeParticipant(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    const session = await this.sessionsService.findById(id);
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }
    if (session.coachId !== user.sub && user.role !== 'platform_admin') {
      throw new ForbiddenException('Only the coach can remove participants');
    }
    if (userId === user.sub) {
      throw new ForbiddenException('Use leave instead of removing yourself');
    }

    await this.livekitService.removeParticipant(id, userId);
    return this.sessionsService.leave(id, userId);
  }
}
