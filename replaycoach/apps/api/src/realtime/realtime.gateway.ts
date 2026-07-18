import { Logger, UseFilters } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import type { JwtPayload } from '@replaycoach/types';

import { Session } from '../sessions/session.entity';
import { SessionParticipant } from '../sessions/session-participant.entity';
import { AnnotationsService } from '../annotations/annotations.service';

@WebSocketGateway({
  cors: {
    origin: (process.env['CORS_ORIGIN']?.split(',')) ?? [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
    ],
    credentials: true,
  },
  // Socket.IO's 20s default pingTimeout is too tight for a client that's
  // also uploading a large video in the same tab: a slow/constrained
  // connection's uplink gets saturated by the upload, delaying the pong
  // response past 20s and killing the realtime connection as a false
  // positive (observed as "ping timeout" disconnects exactly when a coach
  // clicks Upload/Analyze). Both this and pingInterval must be raised
  // together — pingTimeout is measured from each ping, not cumulative.
  pingInterval: 25000,
  pingTimeout: 60000,
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(SessionParticipant)
    private readonly participantRepository: Repository<SessionParticipant>,
    private readonly annotationsService: AnnotationsService,
  ) {}

  async handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.['token'] ||
      client.handshake.query?.['token'];

    if (!token || typeof token !== 'string') {
      this.logger.warn(`Disconnecting unauthenticated socket connection: ${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const payload: JwtPayload = this.jwtService.verify(token);
      client.data = { user: payload };
      this.logger.log(`Socket client ${client.id} authenticated as ${payload.email}`);
    } catch (err: any) {
      this.logger.warn(`JWT validation failed for socket ${client.id}: ${err.message ?? err}`);
      client.disconnect();
    }
  }

  @SubscribeMessage('session:join')
  async handleJoin(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user: JwtPayload | undefined = client.data?.['user'];
    if (!user) {
      return { status: 'error', message: 'Unauthorized' };
    }

    const { sessionId } = data;
    if (!sessionId) {
      return { status: 'error', message: 'Missing sessionId' };
    }

    try {
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return { status: 'error', message: 'Session not found' };
      }

      const participant = await this.participantRepository.findOne({
        where: { sessionId, userId: user.sub },
      });

      const isCoach = session.coachId === user.sub || user.role === 'coach';
      const isPlatformAdmin = user.role === 'platform_admin';
      const isAuthorizedParticipant = !!participant;

      if (!isPlatformAdmin && !isCoach && !isAuthorizedParticipant) {
        this.logger.warn(`Unauthorized join attempt to session ${sessionId} by ${user.email}`);
        return { status: 'error', message: 'Forbidden' };
      }

      // Explicit student target channel
      const studentRoom = `session:${sessionId}:participant:${user.sub}`;
      await client.join(studentRoom);

      if (isPlatformAdmin || isCoach || (participant && participant.status === 'approved')) {
        // Join rooms
        const sessionRoom = `session:${sessionId}`;
        await client.join(sessionRoom);

        if (isCoach) {
          await client.join(`session:${sessionId}:coach`);
        }
        this.logger.log(`Authenticated user ${user.email} joined main room: [${sessionRoom}]`);
      } else {
        this.logger.log(`Lobby pending user ${user.email} joined student room: [${studentRoom}]`);
      }

      return { status: 'ok' };
    } catch (err: any) {
      this.logger.error(`Error in handleJoin for socket ${client.id}: ${err.message ?? err}`);
      return { status: 'error', message: 'Internal server error' };
    }
  }

  /** Session lookup + "is this socket's user the session's coach (or a
   * platform admin)" re-check, shared by every annotation:* handler — the
   * client-claimed role is never trusted, this always re-derives it from
   * the DB. Returns the session on success, or an ack error object to
   * return directly from the handler on failure. */
  private async assertCoachSession(
    sessionId: string,
    user: JwtPayload,
    eventName: string,
  ): Promise<{ session: Session } | { status: 'error'; message: string }> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session) {
      return { status: 'error', message: 'Session not found' };
    }
    if (session.coachId !== user.sub && user.role !== 'platform_admin') {
      this.logger.warn(`Unauthorized ${eventName} trigger by non-coach user ${user.email}`);
      return { status: 'error', message: 'Forbidden' };
    }
    return { session };
  }

  /** Fans an annotation event out to either specific targeted students or
   * the whole session room. Uses `client.to(...)` (excludes the sender),
   * NOT `this.server.to(...)` — the drawing coach already applied their own
   * stroke optimistically client-side; broadcasting back to their own
   * socket too was producing a duplicate on their own canvas. */
  private fanOutAnnotationEvent(
    client: Socket,
    sessionId: string,
    event: string,
    payload: any,
    studentIds?: string[],
  ): void {
    if (studentIds && studentIds.length > 0) {
      for (const studentId of studentIds) {
        client.to(`session:${sessionId}:participant:${studentId}`).emit(event, payload);
      }
    } else {
      client.to(`session:${sessionId}`).emit(event, payload);
    }
  }

  @SubscribeMessage('annotation:draw')
  async handleAnnotationDraw(
    @MessageBody() data: { sessionId: string; payload: any; studentIds?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const user: JwtPayload | undefined = client.data?.['user'];
    if (!user) {
      return { status: 'error', message: 'Unauthorized' };
    }

    const { sessionId, payload, studentIds } = data;
    if (!sessionId || !payload) {
      return { status: 'error', message: 'Missing sessionId or payload' };
    }

    // Rate Limiting checks: max 30 events/sec per connection
    const now = Date.now();
    const rateInfo = client.data.annotationRateInfo || { count: 0, windowStart: now };
    if (now - rateInfo.windowStart > 1000) {
      rateInfo.count = 1;
      rateInfo.windowStart = now;
    } else {
      rateInfo.count++;
      if (rateInfo.count > 30) {
        this.logger.warn(`Rate limit exceeded for annotation:draw on socket ${client.id}`);
        return { status: 'error', message: 'Rate limit exceeded' };
      }
    }
    client.data.annotationRateInfo = rateInfo;

    const check = await this.assertCoachSession(sessionId, user, 'annotation:draw');
    if ('status' in check) return check;

    this.fanOutAnnotationEvent(client, sessionId, 'annotation:draw', payload, studentIds);

    // Optimistic background save
    const { id, type, frameTimestampMs, geometry, textContent, color, thickness, persistUntilCleared } = payload;
    this.annotationsService
      .saveAnnotation(
        {
          id,
          sessionId,
          frameTimestampMs,
          type,
          geometry,
          textContent,
          color,
          thickness,
          persistUntilCleared,
        },
        user.sub,
      )
      .catch((err) => {
        this.logger.error(`Failed to async persist annotation: ${err.message ?? err}`);
      });

    return { status: 'ok' };
  }

  @SubscribeMessage('annotation:undo')
  async handleAnnotationUndo(
    @MessageBody() data: { sessionId: string; frameTimestampMs: number; studentIds?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const user: JwtPayload | undefined = client.data?.['user'];
    if (!user) {
      return { status: 'error', message: 'Unauthorized' };
    }

    const { sessionId, frameTimestampMs, studentIds } = data;
    if (!sessionId || typeof frameTimestampMs !== 'number') {
      return { status: 'error', message: 'Missing sessionId or frameTimestampMs' };
    }

    const check = await this.assertCoachSession(sessionId, user, 'annotation:undo');
    if ('status' in check) return check;

    this.fanOutAnnotationEvent(client, sessionId, 'annotation:undo', { frameTimestampMs }, studentIds);

    // Optimistic delete
    this.annotationsService.undoLastAnnotation(sessionId, user.sub, frameTimestampMs).catch((err) => {
      this.logger.error(`Failed to async undo annotation: ${err.message ?? err}`);
    });

    return { status: 'ok' };
  }

  @SubscribeMessage('annotation:clear')
  async handleAnnotationClear(
    @MessageBody() data: { sessionId: string; frameTimestampMs: number; studentIds?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const user: JwtPayload | undefined = client.data?.['user'];
    if (!user) {
      return { status: 'error', message: 'Unauthorized' };
    }

    const { sessionId, frameTimestampMs, studentIds } = data;
    if (!sessionId || typeof frameTimestampMs !== 'number') {
      return { status: 'error', message: 'Missing sessionId or frameTimestampMs' };
    }

    const check = await this.assertCoachSession(sessionId, user, 'annotation:clear');
    if ('status' in check) return check;

    this.fanOutAnnotationEvent(client, sessionId, 'annotation:clear', { frameTimestampMs }, studentIds);

    // Optimistic tombstone
    this.annotationsService.clearAnnotations(sessionId, user.sub, frameTimestampMs).catch((err) => {
      this.logger.error(`Failed to async clear annotations: ${err.message ?? err}`);
    });

    return { status: 'ok' };
  }

  /** Removes one specific annotation by id — for persistent (joint-attached)
   * shapes, which aren't naturally "the most recent" (undo) or "everything
   * on this exact frame" (clear). */
  @SubscribeMessage('annotation:delete')
  async handleAnnotationDelete(
    @MessageBody() data: { sessionId: string; id: string; studentIds?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const user: JwtPayload | undefined = client.data?.['user'];
    if (!user) {
      return { status: 'error', message: 'Unauthorized' };
    }

    const { sessionId, id, studentIds } = data;
    if (!sessionId || !id) {
      return { status: 'error', message: 'Missing sessionId or id' };
    }

    const check = await this.assertCoachSession(sessionId, user, 'annotation:delete');
    if ('status' in check) return check;

    this.fanOutAnnotationEvent(client, sessionId, 'annotation:delete', { id }, studentIds);

    this.annotationsService.deleteAnnotation(sessionId, id).catch((err) => {
      this.logger.error(`Failed to async delete annotation: ${err.message ?? err}`);
    });

    return { status: 'ok' };
  }

  emitReplayStart(sessionId: string, studentIds: string[], payload: any) {
    for (const studentId of studentIds) {
      const room = `session:${sessionId}:participant:${studentId}`;
      this.logger.log(`Emitting replay:start to room: ${room}`);
      this.server.to(room).emit('replay:start', payload);
    }
  }

  emitReplaySeek(sessionId: string, studentIds: string[], payload: any) {
    for (const studentId of studentIds) {
      const room = `session:${sessionId}:participant:${studentId}`;
      this.server.to(room).emit('replay:seek', payload);
    }
  }

  emitReplayEnd(sessionId: string, studentIds: string[]) {
    for (const studentId of studentIds) {
      const room = `session:${sessionId}:participant:${studentId}`;
      this.logger.log(`Emitting replay:end to room: ${room}`);
      this.server.to(room).emit('replay:end', {});
    }
  }

  emitPoseUpdate(sessionId: string, participantId: string, payload: any) {
    const room = `session:${sessionId}`;
    this.server.to(room).emit('pose:update', {
      participantId,
      ...payload,
    });
  }

  /**
   * Broadcast buffer replay trigger to every participant in the session room.
   * fromOffsetMs: negative value (e.g. -30000 = last 30s)
   * toOffsetMs: 0 = right now
   */
  emitBufferReplay(
    sessionId: string,
    participantId: string,
    fromOffsetMs: number,
    toOffsetMs: number = 0,
  ) {
    const room = `session:${sessionId}`;
    this.logger.log(
      `Emitting session:replay:start to room ${room} for participant ${participantId} [${fromOffsetMs}ms → ${toOffsetMs}ms]`,
    );
    this.server.to(room).emit('session:replay:start', {
      participantId,
      fromOffsetMs,
      toOffsetMs,
    });
  }

  emitBufferReplayEnd(sessionId: string) {
    const room = `session:${sessionId}`;
    this.logger.log(`Emitting session:replay:end to room ${room}`);
    this.server.to(room).emit('session:replay:end', {});
  }

  emitLobbyRequest(sessionId: string, participant: any) {
    const room = `session:${sessionId}:coach`;
    this.logger.log(`Emitting lobby:request to room: ${room}`);
    this.server.to(room).emit('lobby:request', { participant });
  }

  emitLobbyApproved(sessionId: string, userId: string) {
    const room = `session:${sessionId}:participant:${userId}`;
    this.logger.log(`Emitting lobby:approved to room: ${room}`);
    this.server.to(room).emit('lobby:approved', {});
  }

  emitLobbyRejected(sessionId: string, userId: string) {
    const room = `session:${sessionId}:participant:${userId}`;
    this.logger.log(`Emitting lobby:rejected to room: ${room}`);
    this.server.to(room).emit('lobby:rejected', {});
  }

  @SubscribeMessage('session:pin-track')
  async handlePinTrack(
    @MessageBody() data: { sessionId: string; trackSid: string | null },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data?.['user'];
    if (!user) return { status: 'error', message: 'Unauthorized' };

    const session = await this.sessionRepository.findOne({ where: { id: data.sessionId } });
    if (!session) return { status: 'error', message: 'Session not found' };

    const isCoach = session.coachId === user.sub || user.role === 'coach';
    const isPlatformAdmin = user.role === 'platform_admin';
    if (!isCoach && !isPlatformAdmin) return { status: 'error', message: 'Forbidden' };

    this.logger.log(`Room pin track payload for session ${data.sessionId}: ${data.trackSid}`);
    this.server.to(`session:${data.sessionId}`).emit('session:pin-track', { trackSid: data.trackSid });
    return { status: 'ok' };
  }

  emitSessionTerminated(sessionId: string) {
    const room = `session:${sessionId}`;
    this.logger.log(`Emitting session:terminated to room: ${room}`);
    this.server.to(room).emit('session:terminated', {});
  }

  emitRecordingActive(sessionId: string) {
    const room = `session:${sessionId}:coach`;
    this.logger.log(`Emitting session:recording:active to room: ${room}`);
    this.server.to(room).emit('session:recording:active', { sessionId });
  }

  emitRecordingDegraded(sessionId: string, reason: string) {
    const room = `session:${sessionId}:coach`;
    this.logger.warn(`Emitting session:recording:degraded to room: ${room}: ${reason}`);
    this.server.to(room).emit('session:recording:degraded', { sessionId, reason });
  }

  // ── Reference video analysis (coach presents an external/buffered clip) ────

  /**
   * Broadcasts to specific students' rooms if targeted, else the whole
   * session room — excluding the emitting coach's own socket (client.to,
   * not server.to) since the coach already applies these interactions
   * locally/optimistically before emitting; echoing back would double them
   * up (most visibly: the same drawn stroke appended twice).
   */
  private emitToRoomOrStudents(client: Socket, sessionId: string, event: string, payload: any, studentIds?: string[]) {
    if (studentIds && studentIds.length > 0) {
      for (const studentId of studentIds) {
        client.to(`session:${sessionId}:participant:${studentId}`).emit(event, payload);
      }
    } else {
      client.to(`session:${sessionId}`).emit(event, payload);
    }
  }

  /**
   * Triggered from ReferenceController.present(). Always announced room-wide
   * (a one-time "the coach is analyzing a clip" notice) — per-interaction
   * targeting (state/annotate/undo/clear) is handled separately below, since
   * that's where the existing annotation system also draws the line.
   */
  emitReferenceOpen(sessionId: string, payload: any) {
    const room = `session:${sessionId}`;
    this.logger.log(`Emitting reference:open to room: ${room}`);
    this.server.to(room).emit('reference:open', payload);
  }

  /** Triggered from the pose-service completion callback — skeleton overlay is ready. */
  emitReferenceReady(sessionId: string, payload: any) {
    const room = `session:${sessionId}`;
    this.logger.log(`Emitting reference:ready to room: ${room}`);
    this.server.to(room).emit('reference:ready', payload);
  }

  // ── Tracked (joint-attached) annotations — live sync to the room ─────────
  emitReferenceAnnotationCreate(sessionId: string, refId: string, annotation: any) {
    this.server.to(`session:${sessionId}`).emit('reference:annotation-create', { refId, annotation });
  }

  emitReferenceAnnotationUpdate(sessionId: string, refId: string, annotation: any) {
    this.server.to(`session:${sessionId}`).emit('reference:annotation-update', { refId, annotation });
  }

  emitReferenceAnnotationDelete(sessionId: string, refId: string, annotationId: string) {
    this.server.to(`session:${sessionId}`).emit('reference:annotation-delete', { refId, annotationId });
  }

  /** Export finished — clients can refresh to expose the download. Broadcast
   * to all rooms since export runs outside a specific socket context. */
  emitReferenceExportReady(refId: string) {
    this.server.emit('reference:export-ready', { refId });
  }

  /** Previously nothing told the frontend an export had failed — the
   * pose-service job could throw with no notification anywhere, leaving
   * the coach's "Exporting…" spinner stuck forever. See
   * ReferenceMediaController.exportFailed / export_renderer.py. */
  emitReferenceExportFailed(refId: string, reason: string) {
    this.server.emit('reference:export-failed', { refId, reason });
  }

  /** Periodic render progress — see ReferenceMediaController.exportProgress
   * / export_renderer.py's per-frame loop. Same broadcast-to-all shape as
   * the ready/failed events above (the callback only carries refId, not a
   * session context), filtered client-side by refId. */
  emitReferenceExportProgress(refId: string, percent: number) {
    this.server.emit('reference:export-progress', { refId, percent });
  }

  private async assertCoach(sessionId: string, user: JwtPayload): Promise<Session> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session) throw new Error('Session not found');
    if (session.coachId !== user.sub && user.role !== 'platform_admin') {
      throw new Error('Forbidden');
    }
    return session;
  }

  /** Coach play/pause/seek on the reference video — relayed to the room or targeted students. */
  @SubscribeMessage('reference:state')
  async handleReferenceState(
    @MessageBody() data: { sessionId: string; playing: boolean; frameIndex: number; studentIds?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const user: JwtPayload | undefined = client.data?.['user'];
    if (!user) return { status: 'error', message: 'Unauthorized' };
    const { sessionId, playing, frameIndex, studentIds } = data;
    if (!sessionId || typeof frameIndex !== 'number') {
      return { status: 'error', message: 'Missing sessionId or frameIndex' };
    }
    try {
      await this.assertCoach(sessionId, user);
    } catch {
      this.logger.warn(`Unauthorized reference:state trigger by non-coach user ${user.email}`);
      return { status: 'error', message: 'Forbidden' };
    }
    this.emitToRoomOrStudents(client, sessionId, 'reference:state', { playing, frameIndex }, studentIds);
    return { status: 'ok' };
  }

  /** One drawing stroke on the reference video's current frame — relayed to the room or targeted students. */
  @SubscribeMessage('reference:annotate')
  async handleReferenceAnnotate(
    @MessageBody() data: { sessionId: string; frameIndex: number; stroke: any; studentIds?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const user: JwtPayload | undefined = client.data?.['user'];
    if (!user) return { status: 'error', message: 'Unauthorized' };
    const { sessionId, frameIndex, stroke, studentIds } = data;
    if (!sessionId || typeof frameIndex !== 'number' || !stroke) {
      return { status: 'error', message: 'Missing sessionId, frameIndex, or stroke' };
    }
    try {
      await this.assertCoach(sessionId, user);
    } catch {
      this.logger.warn(`Unauthorized reference:annotate trigger by non-coach user ${user.email}`);
      return { status: 'error', message: 'Forbidden' };
    }
    this.emitToRoomOrStudents(client, sessionId, 'reference:annotate', { frameIndex, stroke }, studentIds);
    return { status: 'ok' };
  }

  @SubscribeMessage('reference:undo')
  async handleReferenceUndo(
    @MessageBody() data: { sessionId: string; frameIndex: number; studentIds?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const user: JwtPayload | undefined = client.data?.['user'];
    if (!user) return { status: 'error', message: 'Unauthorized' };
    const { sessionId, frameIndex, studentIds } = data;
    if (!sessionId || typeof frameIndex !== 'number') {
      return { status: 'error', message: 'Missing sessionId or frameIndex' };
    }
    try {
      await this.assertCoach(sessionId, user);
    } catch {
      return { status: 'error', message: 'Forbidden' };
    }
    this.emitToRoomOrStudents(client, sessionId, 'reference:undo', { frameIndex }, studentIds);
    return { status: 'ok' };
  }

  @SubscribeMessage('reference:clear')
  async handleReferenceClear(
    @MessageBody() data: { sessionId: string; frameIndex?: number; studentIds?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const user: JwtPayload | undefined = client.data?.['user'];
    if (!user) return { status: 'error', message: 'Unauthorized' };
    const { sessionId, frameIndex, studentIds } = data;
    if (!sessionId) return { status: 'error', message: 'Missing sessionId' };
    try {
      await this.assertCoach(sessionId, user);
    } catch {
      return { status: 'error', message: 'Forbidden' };
    }
    this.emitToRoomOrStudents(client, sessionId, 'reference:clear', { frameIndex }, studentIds);
    return { status: 'ok' };
  }

  @SubscribeMessage('reference:close')
  async handleReferenceClose(
    @MessageBody() data: { sessionId: string; studentIds?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const user: JwtPayload | undefined = client.data?.['user'];
    if (!user) return { status: 'error', message: 'Unauthorized' };
    const { sessionId, studentIds } = data;
    if (!sessionId) return { status: 'error', message: 'Missing sessionId' };
    try {
      await this.assertCoach(sessionId, user);
    } catch {
      return { status: 'error', message: 'Forbidden' };
    }
    this.emitToRoomOrStudents(client, sessionId, 'reference:close', {}, studentIds);
    return { status: 'ok' };
  }
}
