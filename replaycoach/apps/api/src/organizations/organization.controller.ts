import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import type {
  CreateInviteResponse,
  JwtPayload,
  OrganizationDto,
  OrganizationSummaryDto,
  OrgInviteDto,
  UserDto,
} from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateOrganizationDto, InviteToOrgDto, UpdateOrganizationDto } from './organization.dto';
import { OrganizationService } from './organization.service';
import { OrganizationGuard } from './organization.guard';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOrganizationDto,
  ): Promise<OrganizationDto> {
    const org = await this.orgService.create(dto, user);
    return this.orgService.toDto(org);
  }

  /** Platform-wide cross-org listing — platform_admin only (a studio_admin
   * only ever sees their own org via GET /organizations/:id). */
  @Get()
  @Roles('platform_admin')
  async listAll(): Promise<OrganizationSummaryDto[]> {
    return this.orgService.listAll();
  }

  @Get(':id')
  @UseGuards(OrganizationGuard)
  async get(@Param('id') id: string): Promise<OrganizationDto> {
    const org = await this.orgService.findById(id);
    return this.orgService.toDto(org);
  }

  @Patch(':id')
  @UseGuards(OrganizationGuard)
  @Roles('platform_admin', 'studio_admin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrganizationDto> {
    const org = await this.orgService.update(id, dto, user);
    return this.orgService.toDto(org);
  }

  @Get(':id/members')
  @UseGuards(OrganizationGuard)
  async listMembers(@Param('id') id: string): Promise<UserDto[]> {
    return this.orgService.listMembers(id);
  }

  @Delete(':id/members/:userId')
  @UseGuards(OrganizationGuard)
  @Roles('platform_admin', 'studio_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.orgService.removeMember(id, userId, user);
  }

  @Post(':id/invite')
  @UseGuards(OrganizationGuard)
  @Roles('platform_admin', 'studio_admin', 'coach')
  async invite(
    @Param('id') orgId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: InviteToOrgDto,
  ): Promise<CreateInviteResponse> {
    return this.orgService.createInvite(orgId, user, dto);
  }

  @Get(':id/invites')
  @UseGuards(OrganizationGuard)
  @Roles('platform_admin', 'studio_admin', 'coach')
  async listInvites(@Param('id') orgId: string, @CurrentUser() user: JwtPayload): Promise<OrgInviteDto[]> {
    return this.orgService.listInvites(orgId, user);
  }

  @Delete(':id/invites/:inviteId')
  @UseGuards(OrganizationGuard)
  @Roles('platform_admin', 'studio_admin', 'coach')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeInvite(
    @Param('id') orgId: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.orgService.revokeInvite(orgId, inviteId, user);
  }

  @Post(':id/invites/:inviteId/resend')
  @UseGuards(OrganizationGuard)
  @Roles('platform_admin', 'studio_admin', 'coach')
  async resendInvite(
    @Param('id') orgId: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CreateInviteResponse> {
    return this.orgService.resendInvite(orgId, inviteId, user);
  }
}
