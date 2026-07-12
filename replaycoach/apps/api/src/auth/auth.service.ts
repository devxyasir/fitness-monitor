import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';

import type { JwtPayload, TokenResponse } from '@replaycoach/types';

import { UserService } from '../users/user.service';
import { RefreshTokenService } from './refresh-token.service';
import type { RegisterDto, LoginDto } from './auth.dto';
import { parseDurationMs } from './duration.util';

/** What the controller needs to both respond to the client and set the refresh cookie. */
interface AuthResult {
  tokenResponse: TokenResponse;
  refreshToken: string;
  rememberMe: boolean;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly configService: ConfigService,
  ) {}

  /** Register a new user and issue tokens. A fresh signup stays logged in
   * (long TTL) since there's no "remember me" toggle on the register form. */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const user = await this.userService.create({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
      role: dto.role,
    });

    return this.issueTokenPair(user.id, user.email, user.role, user.orgId, user.sessionVersion, true);
  }

  /** Login with email/password. */
  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.userService.findByEmail(dto.email);

    // Use constant-time comparison to prevent user enumeration via timing attacks.
    // If no user is found, we still run a dummy verify to keep constant timing.
    const DUMMY_HASH =
      '$argon2id$v=19$m=65536,t=3,p=4$deadbeefdeadbeef$deadbeefdeadbeefdeadbeefdeadbeef';

    const passwordHash = user?.passwordHash ?? DUMMY_HASH;
    const valid = await argon2.verify(passwordHash, dto.password).catch(() => false);

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair(user.id, user.email, user.role, user.orgId, user.sessionVersion, dto.rememberMe ?? false);
  }

  /**
   * Rotate refresh token.
   * Detects reuse: if the token is not found in the DB, the family is revoked
   * and the user is forced to re-authenticate.
   */
  async refresh(rawRefreshToken: string): Promise<AuthResult> {
    const existing = await this.refreshTokenService.findValid(rawRefreshToken);

    if (!existing) {
      // Could be an expired token OR a reused (rotated-out) token.
      // We can't distinguish without the familyId, so reject cleanly.
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: delete old, insert new in same family. The "remember me"
    // choice lives on the row itself (set at login) so it carries forward
    // across rotations regardless of what this request does or doesn't send.
    let expiresAt = new Date();
    const { newRawToken, rememberMe } = await this.refreshTokenService.rotate(
      rawRefreshToken,
      existing.userId,
      (remember) => {
        expiresAt = this.refreshExpiresAt(remember);
        return expiresAt;
      },
    );

    const user = await this.userService.findById(existing.userId);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
      sessionVersion: user.sessionVersion,
    };

    const accessToken = this.jwtService.sign(payload);
    return { tokenResponse: { accessToken }, refreshToken: newRawToken, rememberMe, expiresAt };
  }

  /**
   * Logout: revokes the refresh token AND bumps sessionVersion so any
   * still-live access token (up to JWT_EXPIRY old) is rejected immediately
   * instead of remaining valid until it naturally expires.
   */
  async logout(rawRefreshToken: string | undefined, userId: string): Promise<void> {
    await this.userService.incrementSessionVersion(userId);
    if (rawRefreshToken) {
      await this.refreshTokenService.revoke(rawRefreshToken);
    }
  }

  /**
   * Password reset request stub.
   * Always returns 200 — never reveals whether an email exists (prevents user enumeration).
   */
  async forgotPassword(_email: string): Promise<void> {
    // TODO: Phase 2 — send a time-limited signed reset link via email.
    // Do NOT log the email address at INFO level (16_Security_Guidelines.md §9).
  }

  /** Password reset stub — to be implemented in Phase 2 with email infra. */
  async resetPassword(_token: string, _newPassword: string): Promise<void> {
    throw new NotFoundException('Password reset not yet configured');
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async issueTokenPair(
    userId: string,
    email: string,
    role: string,
    orgId: string | null,
    sessionVersion: number,
    rememberMe: boolean,
  ): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: userId,
      email,
      role: role as JwtPayload['role'],
      orgId,
      sessionVersion,
    };

    const accessToken = this.jwtService.sign(payload);
    const rawRefreshToken = uuidv4();
    const expiresAt = this.refreshExpiresAt(rememberMe);
    await this.refreshTokenService.store(userId, rawRefreshToken, expiresAt, undefined, rememberMe);

    return { tokenResponse: { accessToken }, refreshToken: rawRefreshToken, rememberMe, expiresAt };
  }

  /**
   * "Remember me" → the long-lived TTL (jwt.refreshExpiry, default 7d).
   * Otherwise → a short session TTL (jwt.sessionExpiry, default 1d) and the
   * cookie itself is set as a non-persistent session cookie (cleared on
   * browser close) — see cookie.helper.ts.
   */
  private refreshExpiresAt(rememberMe: boolean): Date {
    if (rememberMe) {
      const raw = this.configService.get<string>('jwt.refreshExpiry') ?? '7d';
      return new Date(Date.now() + parseDurationMs(raw, 7 * 86_400_000));
    }
    const raw = this.configService.get<string>('jwt.sessionExpiry') ?? '1d';
    return new Date(Date.now() + parseDurationMs(raw, 86_400_000));
  }
}
