import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import type { JwtPayload } from '@replaycoach/types';

/**
 * Resource-scoping guard for routes shaped like `/organizations/:id/...` (or
 * any route with an `:orgId`/`:id` param that names an organization): grants
 * access only to a platform_admin or a member of that specific org. Mirrors
 * SessionsGuard's role in the sessions module — role-level checks (e.g. "must
 * be studio_admin to mutate") still belong on top via @Roles()/RolesGuard;
 * this guard only answers "does this user belong to the org in the URL."
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    if (user.role === 'platform_admin') {
      return true;
    }

    const orgId = (request.params['orgId'] ?? request.params['id']) as string | undefined;
    if (!orgId) {
      // No org ID in the route — nothing to scope against (e.g. POST /organizations itself).
      return true;
    }

    if (user.orgId !== orgId) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    return true;
  }
}
