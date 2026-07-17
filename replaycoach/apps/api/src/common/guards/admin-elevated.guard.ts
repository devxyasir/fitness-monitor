import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { JwtPayload } from '@replaycoach/types';

import { parseDurationMs } from '../../auth/duration.util';

/**
 * Step-up guard for genuinely admin-exclusive surfaces (the new admin
 * dashboard/audit/security controllers) — layered on top of, not instead
 * of, `@Roles('platform_admin')`. Requires the caller's `adminAuthAt` claim
 * (stamped by /admin/login or /auth/admin/elevate) to be within
 * ADMIN_ELEVATION_TTL of "now". A normal platform_admin token minted via
 * the regular /login page never carries this claim, so it fails here even
 * though RolesGuard alone would let it through — that's the point: entering
 * the admin area requires having actually authenticated *as* an admin
 * recently, not just holding a token that happens to have the right role.
 *
 * Deliberately NOT applied to user.controller.ts/organization.controller.ts
 * routes that platform_admin already shares with studio_admin — only to
 * new, purely admin-panel surface.
 */
@Injectable()
export class AdminElevatedGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    if (!user || user.role !== 'platform_admin') {
      throw new ForbiddenException('Insufficient role');
    }

    const ttlMs = parseDurationMs(this.configService.get<string>('admin.elevationTtl', '30m'), 30 * 60_000);
    const elevatedAt = user.adminAuthAt ?? 0;

    if (Date.now() - elevatedAt >= ttlMs) {
      // The global HttpExceptionFilter whitelists exactly {statusCode,
      // error, message, requestId} from the response body (deliberately —
      // never leak arbitrary custom fields) — `error` is the one field of
      // those that's safe to repurpose as a machine-readable code, since
      // Nest's own built-in exceptions already put a short label there
      // ('Forbidden', 'Not Found', etc). The frontend checks this exact
      // value to distinguish "needs step-up" from an ordinary 403.
      throw new ForbiddenException({
        error: 'ADMIN_ELEVATION_REQUIRED',
        message: 'Please re-enter your password to continue.',
      });
    }

    return true;
  }
}
