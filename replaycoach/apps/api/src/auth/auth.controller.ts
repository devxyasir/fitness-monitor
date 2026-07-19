import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import type { JwtPayload, TokenResponse } from '@replaycoach/types';

import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { GeoAccessGuard } from '../geo/geo-access.guard';
import { AuthService } from './auth.service';
import {
  AdminElevateDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';
import {
  clearRefreshCookie,
  getRefreshTokenFromCookie,
  setRefreshCookie,
} from './cookie.helper';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /** POST /auth/register — GeoAccessGuard is real backend enforcement, not
   * bypassable by skipping a frontend check (see the guard's own comment). */
  @Public()
  @UseGuards(GeoAccessGuard)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponse> {
    const { tokenResponse, refreshToken, rememberMe, expiresAt } = await this.authService.register(dto);
    setRefreshCookie(res, refreshToken, this.configService, { rememberMe, expiresAt });
    return tokenResponse;
  }

  /**
   * POST /auth/login
   * Rate limited: 10/min per IP. Was 5/min — this single route handles both
   * regular and admin logins (distinguished by body.context), sharing one
   * IP-keyed bucket, so a coach/student login shortly followed by an admin
   * login attempt (or one mistyped password) from the same network could
   * exhaust the limit and surface a raw throttle error on a legitimate
   * admin login. 10/min still meaningfully deters brute-forcing (each guess
   * also costs a full argon2 hash + constant-time comparison server-side),
   * just with realistic headroom for normal use.
   */
  @Public()
  @UseGuards(GeoAccessGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponse> {
    const { tokenResponse, refreshToken, rememberMe, expiresAt } = await this.authService.login(dto, req.ip);
    setRefreshCookie(res, refreshToken, this.configService, { rememberMe, expiresAt });
    return tokenResponse;
  }

  /**
   * POST /auth/admin/elevate — step-up re-verification for an
   * already-logged-in platform_admin whose `adminAuthAt` has gone stale.
   * Requires a valid access token (any freshness); re-checks the password
   * and mints a fresh one with a new `adminAuthAt`. Throttled the same as
   * /auth/login since it's another password-guessing surface.
   */
  @Post('admin/elevate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async elevate(
    @CurrentUser() payload: JwtPayload,
    @Body() dto: AdminElevateDto,
  ): Promise<TokenResponse> {
    return this.authService.elevate(payload.sub, dto.password);
  }

  /** POST /auth/refresh — reads httpOnly cookie, issues new token pair. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponse> {
    const rawToken = getRefreshTokenFromCookie(req as { cookies?: Record<string, string> });
    const { tokenResponse, refreshToken, rememberMe, expiresAt } = await this.authService.refresh(rawToken ?? '');
    setRefreshCookie(res, refreshToken, this.configService, { rememberMe, expiresAt });
    return tokenResponse;
  }

  /** POST /auth/logout — requires a valid access token. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() payload: JwtPayload,
  ): Promise<void> {
    const rawToken = getRefreshTokenFromCookie(req as { cookies?: Record<string, string> });
    await this.authService.logout(rawToken, payload.sub);
    clearRefreshCookie(res, this.configService);
  }

  /**
   * POST /auth/password/forgot
   * Rate limited: 3/hour per IP (12_Backend_API_Design.md §7).
   * Always returns 200 — never reveals whether an email exists.
   */
  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If that account exists, a reset link has been sent.' };
  }

  /** POST /auth/password/reset — stub until email infra exists. */
  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password updated.' };
  }
}
