import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload, OrganizationDto } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateOrganizationDto, InviteToOrgDto } from './organization.dto';
import { OrganizationService } from './organization.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post()
  async create(
    @CurrentUser() payload: JwtPayload,
    @Body() dto: CreateOrganizationDto,
  ): Promise<OrganizationDto> {
    const org = await this.orgService.create(dto, payload.sub);
    return this.orgService.toDto(org);
  }

  @Post(':id/invite')
  async invite(
    @Param('id') orgId: string,
    @CurrentUser() payload: JwtPayload,
    @Body() dto: InviteToOrgDto,
  ): Promise<{ message: string; inviteToken: string }> {
    const { inviteToken } = await this.orgService.createInvite(
      orgId,
      payload.sub,
      payload.role,
      dto,
    );
    return {
      message: 'Invite created. In production, an email would be sent.',
      inviteToken,
    };
  }
}
