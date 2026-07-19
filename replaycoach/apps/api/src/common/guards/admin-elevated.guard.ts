import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { JwtPayload } from '@replaycoach/types';

import { parseDurationMs } from '../../auth/duration.util';

/**
 * Step-up guard for admin-exclusive data/actions — layered on top of, not
 * instead of, `@Roles(...)`. Requires the caller's `adminAuthAt` claim
 * (stamped by /admin/login or /auth/admin/elevate) to be within
 * ADMIN_ELEVATION_TTL of "now". A normal platform_admin token minted via
 * the regular /login page never carries this claim, so it fails here even
 * though RolesGuard alone would let it through — that's the point: entering
 * the admin area requires having actually authenticated *as* an admin
 * recently, not just holding a token that happens to have the right role.
 *
 * Safe to apply to routes SHARED with non-admin roles (e.g.
 * user.controller.ts/organization.controller.ts's studio_admin/coach
 * endpoints): a non-platform_admin caller is passed through untouched —
 * role authorization is RolesGuard's job, not this guard's. This guard
 * only ever has an opinion about platform_admin callers specifically.
 * Earlier versions of this guard threw for any non-platform_admin role,
 * which is why it was previously applied only to purely admin-exclusive
 * controllers — that made elevation enforcement inconsistent across the
 * admin panel (dashboard/sessions/geo-logs/settings required a fresh
 * re-login but Users/Organizations didn't, for a platform_admin whose
 * elevation had lapsed), which is the actual bug this fixes.
 */
@Injectable()
export class AdminElevatedGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    // Not a platform_admin (or not authenticated at all — JwtAuthGuard
    // already handles that case) — nothing for this guard to enforce here;
    // let RolesGuard's own decision stand.
    if (!user || user.role !== 'platform_admin') {
      return true;
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
