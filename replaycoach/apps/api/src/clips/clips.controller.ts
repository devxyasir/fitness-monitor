import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ClipsService } from './clips.service';
import { CreateClipDto, ShareClipDto } from './clips.dto';
import type { JwtPayload } from '@replaycoach/types';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  @Post('sessions/:sessionId/clips')
  @Roles('coach')
  async create(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateClipDto,
  ) {
    return this.clipsService.createClip(sessionId, user.sub, dto);
  }

  @Get('clips')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.clipsService.getClips(user.sub, user.role, sessionId);
  }

  @Get('clips/:id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clipsService.getClip(id, user.sub, user.role);
  }

  @Post('clips/:id/share')
  @Roles('coach')
  async share(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ShareClipDto,
  ) {
    return this.clipsService.shareClip(id, user.sub, dto.studentIds);
  }
}
