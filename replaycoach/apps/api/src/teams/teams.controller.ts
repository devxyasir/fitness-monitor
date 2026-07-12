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

import type { JwtPayload, TeamDto, TeamMemberDto } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrganizationGuard } from '../organizations/organization.guard';
import { TeamsService } from './teams.service';
import { AddTeamMemberDto, CreateTeamDto, UpdateTeamDto } from './teams.dto';

@Controller('organizations/:orgId/teams')
@UseGuards(JwtAuthGuard, RolesGuard, OrganizationGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @Roles('platform_admin', 'studio_admin')
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateTeamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TeamDto> {
    return this.teamsService.createTeam(orgId, dto, user);
  }

  @Get()
  async list(@Param('orgId') orgId: string): Promise<TeamDto[]> {
    return this.teamsService.listTeams(orgId);
  }

  @Get(':teamId')
  async get(
    @Param('orgId') orgId: string,
    @Param('teamId') teamId: string,
  ): Promise<{ team: TeamDto; members: TeamMemberDto[] }> {
    return this.teamsService.getTeam(orgId, teamId);
  }

  @Patch(':teamId')
  @Roles('platform_admin', 'studio_admin')
  async update(
    @Param('orgId') orgId: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TeamDto> {
    return this.teamsService.updateTeam(orgId, teamId, dto, user);
  }

  @Delete(':teamId')
  @Roles('platform_admin', 'studio_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('orgId') orgId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.teamsService.deleteTeam(orgId, teamId, user);
  }

  /** No @Roles — a team lead (not just an org admin) can manage their own
   * team's roster; TeamsService enforces that distinction. */
  @Post(':teamId/members')
  async addMember(
    @Param('orgId') orgId: string,
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamMemberDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TeamMemberDto> {
    return this.teamsService.addMember(orgId, teamId, dto, user);
  }

  @Delete(':teamId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('orgId') orgId: string,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.teamsService.removeMember(orgId, teamId, userId, user);
  }
}
