import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { JwtPayload } from '@replaycoach/types';
import { SessionsService } from './sessions.service';

@Injectable()
export class SessionsGuard implements CanActivate {
  constructor(private readonly sessionsService: SessionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    const sessionId = request.params.id as string;
    if (!sessionId) {
      // If there's no resource ID in the params (e.g. GET /sessions), fallback to role gates
      return true;
    }

    const session = await this.sessionsService.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    // 1. Platform admin gets full access — including to hidden sessions,
    // since reviewing hidden content is the whole point of the flag.
    if (user.role === 'platform_admin') {
      return true;
    }

    // A session hidden by an admin is blocked for everyone else, ahead of
    // every other access check below (coach, participant, studio_admin) —
    // this is what makes "hidden" an actual access block, not cosmetic.
    if (session.hidden) {
      throw new ForbiddenException('This session has been hidden by an administrator.');
    }

    // 2. Session's coach gets full access
    if (session.coachId === user.sub) {
      return true;
    }

    // 3. User is an active participant
    const isParticipant = await this.sessionsService.isParticipant(sessionId, user.sub);
    if (isParticipant) {
      return true;
    }

    // 4. Studio admin meta access
    if (user.role === 'studio_admin' && session.orgId === user.orgId) {
      const isReadMethod = ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
      if (isReadMethod) {
        return true;
      }
    }

    // 5. Allow join requests (POST /sessions/:id/join) so they can become a participant
    if (request.method === 'POST' && request.path.endsWith('/join')) {
      return true;
    }

    throw new ForbiddenException('You do not have access to this session');
  }
}
