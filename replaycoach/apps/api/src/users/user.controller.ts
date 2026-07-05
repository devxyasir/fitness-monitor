import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';

import type { UserDto } from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '@replaycoach/types';
import { UpdateUserDto } from './user.dto';
import { UserService } from './user.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
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
}
