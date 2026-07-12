import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { JwtPayload } from '@replaycoach/types';

import { UserService } from '../users/user.service';

/**
 * JWT validation strategy.
 *
 * - Extracts Bearer token from Authorization header.
 * - Verifies signature + expiry.
 * - Validates sessionVersion against the DB — rejects if mismatched.
 *   This enables instant invalidation on password change / forced logout (06 §7).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // A NotFoundException here (deleted/never-existed user) would otherwise
    // surface as a 404-shaped error mid-auth-guard instead of a clean 401 —
    // from the client's point of view this is just "not authenticated".
    const user = await this.userService.findById(payload.sub).catch(() => null);

    if (!user || user.sessionVersion !== payload.sessionVersion) {
      throw new UnauthorizedException('Session invalidated — please log in again');
    }

    // A still-live access token issued before an admin suspended/disabled
    // this account must stop working immediately, not just at its natural
    // 15-minute expiry — same rationale as the sessionVersion check above.
    if (user.status === 'suspended' || user.status === 'disabled') {
      throw new UnauthorizedException('This account is no longer active');
    }

    return payload;
  }
}
