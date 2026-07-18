import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { GeoCheckService } from './geo-check.service';

/**
 * Real backend enforcement for the two endpoints the spec explicitly calls
 * out — "Authentication, Registration, Login" — applied directly to
 * AuthController's register()/login() handlers. This is what makes the
 * block unbypassable by skipping a frontend check: a request straight from
 * curl/a mobile client hits this guard exactly the same as one routed
 * through the Next.js middleware's page-level gate.
 *
 * Deliberately NOT a global APP_GUARD covering every route — that would
 * risk kicking an already-authenticated user mid-session on a transient IP
 * misresolution, which is a worse failure mode for a live-coaching platform
 * than under-covering less critical endpoints in this phase.
 */
@Injectable()
export class GeoAccessGuard implements CanActivate {
  constructor(private readonly geoCheckService: GeoCheckService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const result = await this.geoCheckService.check(request.ip ?? '', null);

    if (!result.allowed) {
      // The global HttpExceptionFilter only ever forwards {error, message}
      // from an exception body (see its own doc comment) — anything else,
      // like a location breakdown, would be silently dropped. That's fine
      // here: this guard is a defense-in-depth backend safety net for
      // direct API callers (curl, a mobile client) bypassing the frontend
      // entirely, not the primary blocked-visitor UX — that's
      // POST /geo/check's plain 200 response, read by the Next.js
      // middleware before a visitor ever reaches this login/register form.
      throw new ForbiddenException({
        error: 'GEO_BLOCKED',
        message: 'This service is not available in your region.',
      });
    }

    return true;
  }
}
