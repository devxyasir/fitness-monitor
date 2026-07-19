import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import type { JwtPayload, TotpEnrollResponse, UserDto, UserListResponse } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminElevatedGuard } from '../common/guards/admin-elevated.guard';
import {
  ChangePasswordDto,
  ListUsersQueryDto,
  TotpDisableDto,
  TotpVerifyDto,
  UpdateUserDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './user.dto';
import { UserService } from './user.service';
import { AvatarService } from './avatar.service';

const MAX_AVATAR_UPLOAD_BYTES = 8 * 1024 * 1024;

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly avatarService: AvatarService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() payload: JwtPayload): Promise<UserDto> {
    const user = await this.userService.findById(payload.sub);
    return this.userService.toDto(user);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() payload: JwtPayload,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    const user = await this.userService.update(payload.sub, dto);
    return this.userService.toDto(user);
  }

  /** Compresses/resizes the upload (see AvatarService) and sets it as the
   * caller's avatar. Cleans up the previously-uploaded file, if any, so
   * repeated re-uploads don't leak disk space. */
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_UPLOAD_BYTES } }))
  async uploadAvatar(
    @CurrentUser() payload: JwtPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UserDto> {
    if (!file) throw new ForbiddenException('No file uploaded');
    const avatarUrl = await this.avatarService.processAndSave(payload.sub, file);
    // UserService.update() cleans up the previous avatar file, if any, as
    // part of the write — no separate cleanup call needed here.
    const user = await this.userService.update(payload.sub, { avatarUrl });
    return this.userService.toDto(user);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@CurrentUser() payload: JwtPayload, @Body() dto: ChangePasswordDto): Promise<void> {
    await this.userService.changePassword(payload.sub, dto.currentPassword, dto.newPassword);
  }

  @Post('me/totp/enroll')
  async enrollTotp(@CurrentUser() payload: JwtPayload): Promise<TotpEnrollResponse> {
    return this.userService.enrollTotp(payload.sub);
  }

  @Post('me/totp/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmTotp(@CurrentUser() payload: JwtPayload, @Body() dto: TotpVerifyDto): Promise<void> {
    await this.userService.confirmTotp(payload.sub, dto.token);
  }

  @Post('me/totp/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableTotp(@CurrentUser() payload: JwtPayload, @Body() dto: TotpDisableDto): Promise<void> {
    await this.userService.disableTotp(payload.sub, dto.password);
  }

  /** Self-service account deactivation (soft delete). Logs the caller out
   * client-side is the frontend's job; server-side, the row simply stops
   * being findable so every subsequent request 401s. */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(@CurrentUser() payload: JwtPayload): Promise<void> {
    await this.userService.softDeleteSelf(payload.sub);
  }

  /** Admin user directory — platform_admin sees everyone (optionally
   * filtered by org); studio_admin is always scoped to their own org
   * regardless of what orgId they pass (enforced in UserService).
   * AdminElevatedGuard is a no-op for studio_admin (see the guard's own
   * comment) — this only requires fresh admin re-auth for platform_admin,
   * matching the same elevation the admin dashboard/sessions/settings
   * pages already require (previously inconsistent — Users/Organizations
   * stayed accessible indefinitely after elevation lapsed). */
  @Get()
  @Roles('platform_admin', 'studio_admin')
  @UseGuards(AdminElevatedGuard)
  async list(
    @CurrentUser() payload: JwtPayload,
    @Query() query: ListUsersQueryDto,
  ): Promise<UserListResponse> {
    return this.userService.listUsers(
      { orgId: query.orgId, role: query.role, status: query.status, search: query.search },
      query.page ?? 1,
      query.pageSize ?? 20,
      payload,
    );
  }

  @Get(':id')
  @Roles('platform_admin', 'studio_admin')
  @UseGuards(AdminElevatedGuard)
  async getById(@Param('id') id: string, @CurrentUser() payload: JwtPayload): Promise<UserDto> {
    const target = await this.userService.findById(id);
    // Same org-scoping as list(): a studio_admin can look up any user by ID
    // only within their own org.
    if (
      payload.role === 'studio_admin' &&
      (target.orgId === null || target.orgId !== payload.orgId)
    ) {
      throw new ForbiddenException('You can only view users in your own organization');
    }
    return this.userService.toDto(target);
  }

  @Patch(':id/status')
  @Roles('platform_admin', 'studio_admin')
  @UseGuards(AdminElevatedGuard)
  async setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() payload: JwtPayload,
  ): Promise<UserDto> {
    const updated = await this.userService.setStatus(id, dto.status, payload);
    return this.userService.toDto(updated);
  }

  /** platform_admin only — role changes are a stronger privilege than
   * status changes (see UserService.setRole). */
  @Patch(':id/role')
  @Roles('platform_admin')
  @UseGuards(AdminElevatedGuard)
  async setRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() payload: JwtPayload,
  ): Promise<UserDto> {
    const updated = await this.userService.setRole(id, dto.role, payload);
    return this.userService.toDto(updated);
  }
}
