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
  Query,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload, UserDto, UserListResponse } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ListUsersQueryDto, UpdateUserDto, UpdateUserStatusDto } from './user.dto';
import { UserService } from './user.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

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
   * regardless of what orgId they pass (enforced in UserService). */
  @Get()
  @Roles('platform_admin', 'studio_admin')
  async list(
    @CurrentUser() payload: JwtPayload,
    @Query() query: ListUsersQueryDto,
  ): Promise<UserListResponse> {
    return this.userService.listUsers(
      { orgId: query.orgId, role: query.role, status: query.status },
      query.page ?? 1,
      query.pageSize ?? 20,
      payload,
    );
  }

  @Get(':id')
  @Roles('platform_admin', 'studio_admin')
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
  async setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() payload: JwtPayload,
  ): Promise<UserDto> {
    const updated = await this.userService.setStatus(id, dto.status, payload);
    return this.userService.toDto(updated);
  }
}
