import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionsGuard } from '../sessions/sessions.guard';
import { ReplayService } from './replay.service';
import type { JwtPayload } from '@replaycoach/types';

class BufferReplayDto {
  /** Target student ID to replay */
  @IsString()
  participantId!: string;

  /** Negative offset ms from now: e.g. -30000 = last 30 seconds */
  @IsNumber()
  fromOffsetMs!: number;

  /** End offset ms from now: 0 = right now */
  @IsNumber()
  @IsOptional()
  toOffsetMs?: number;
}

class TargetReplayDto {
  /** Targeted student IDs to sync seek position to */
  @IsArray()
  @IsString({ each: true })
  studentIds!: string[];

  /** Target replay player currentTime seek position in milliseconds */
  @IsNumber()
  timestampMs!: number;
}

@Controller('sessions/:id/replay')
@UseGuards(JwtAuthGuard, RolesGuard, SessionsGuard)
export class ReplayController {
  constructor(private readonly replayService: ReplayService) {}

  /** Coach triggers buffer replay for the entire room. */
  @Post('seek')
  @Roles('coach')
  @HttpCode(HttpStatus.OK)
  async seek(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: BufferReplayDto,
  ) {
    return this.replayService.seekReplay(
      id,
      user.sub,
      dto.participantId,
      dto.fromOffsetMs,
      dto.toOffsetMs ?? 0,
    );
  }

  /** Coach syncs seeking position for selected student participants. */
  @Post('target')
  @Roles('coach')
  @HttpCode(HttpStatus.OK)
  async target(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: TargetReplayDto,
  ) {
    return this.replayService.targetReplay(
      id,
      user.sub,
      dto.studentIds,
      dto.timestampMs,
    );
  }

  /** Coach ends replay for the entire room. */
  @Post('end')
  @Roles('coach')
  @HttpCode(HttpStatus.OK)
  async end(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.replayService.endReplay(id, user.sub);
  }
}
