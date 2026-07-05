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
    const user = await this.userService.findById(payload.sub);

    if (user.sessionVersion !== payload.sessionVersion) {
      throw new UnauthorizedException('Session invalidated — please log in again');
    }

    return payload;
  }
}
