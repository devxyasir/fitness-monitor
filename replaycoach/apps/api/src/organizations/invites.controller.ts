import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import type { InvitePreviewDto, JwtPayload, UserDto } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { OrganizationService } from './organization.service';

/**
 * Not nested under /organizations/:id — a visitor doesn't know (and
 * shouldn't need to know) which org an invite token belongs to; the token
 * alone identifies it.
 */
@Controller('invites')
export class InvitesController {
  constructor(private readonly orgService: OrganizationService) {}

  /** Public — lets the frontend show "you're invited to join X as a Y"
   * before the visitor has an account or is logged in. */
  @Public()
  @Get(':token')
  async preview(@Param('token') token: string): Promise<InvitePreviewDto> {
    return this.orgService.getInvitePreview(token);
  }

  @Post(':token/accept')
  @UseGuards(JwtAuthGuard)
  async accept(@Param('token') token: string, @CurrentUser() user: JwtPayload): Promise<UserDto> {
    return this.orgService.acceptInvite(token, user);
  }
}
