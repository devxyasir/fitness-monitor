import { Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';

import type { JwtPayload, UserSessionDto } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminElevatedGuard } from '../common/guards/admin-elevated.guard';
import { UserService } from '../users/user.service';
import { RefreshTokenService } from '../auth/refresh-token.service';
import { AuditService } from '../audit/audit.service';

/**
 * Security-panel routes under the `/users` prefix (kept alongside
 * UserController's own routes for a consistent URL shape) but registered
 * in AdminModule rather than UserModule — they need RefreshTokenService,
 * which lives in AuthModule; UserModule can't import AuthModule without a
 * cycle (AuthModule already imports UserModule), so this controller lives
 * where both AuthModule and UserModule can be safely imported instead.
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminUserSecurityController {
  constructor(
    private readonly userService: UserService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly auditService: AuditService,
  ) {}

  /** Pure admin-panel surface — step-up protected. Unlike force-logout
   * below, this has no studio_admin equivalent, so requiring elevation
   * doesn't block anyone who legitimately needs the route. */
  @Get(':id/sessions')
  @Roles('platform_admin')
  @UseGuards(AdminElevatedGuard)
  async listSessions(@Param('id') id: string): Promise<UserSessionDto[]> {
    const rows = await this.refreshTokenService.listActiveForUser(id);
    return rows.map((row) => ({
      id: row.id,
      rememberMe: row.rememberMe,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }));
  }

  @Delete(':id/sessions/:tokenId')
  @Roles('platform_admin')
  @UseGuards(AdminElevatedGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('id') id: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() payload: JwtPayload,
  ): Promise<void> {
    await this.refreshTokenService.revokeById(tokenId, id);
    void this.auditService.record(payload.sub, 'user.session_revoked', 'user', id, { tokenId });
  }

  /** Immediately invalidates every already-issued access token (via
   * sessionVersion) AND every refresh-token session — the two mechanisms
   * together are what "log out everywhere" actually means; before this,
   * RefreshTokenService.revokeAllForUser existed but had zero call sites. */
  @Post(':id/force-logout')
  @Roles('platform_admin', 'studio_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forceLogout(@Param('id') id: string, @CurrentUser() payload: JwtPayload): Promise<void> {
    const target = await this.userService.findById(id);
    if (payload.role === 'studio_admin') {
      if (target.orgId === null || target.orgId !== payload.orgId) {
        throw new ForbiddenException('You can only manage users in your own organization');
      }
      if (target.role === 'platform_admin') {
        throw new ForbiddenException('You cannot manage a platform admin');
      }
    }

    await this.userService.incrementSessionVersion(id);
    await this.refreshTokenService.revokeAllForUser(id);
    void this.auditService.record(payload.sub, 'user.force_logout', 'user', id, {});
  }
}
