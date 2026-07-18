import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';

import type { GeoCheckResponse } from '@replaycoach/types';

import { Public } from '../common/decorators/public.decorator';
import { GeoCheckDto } from './geo.dto';
import { GeoCheckService } from './geo-check.service';

@Controller('geo')
export class GeoController {
  constructor(private readonly geoCheckService: GeoCheckService) {}

  /**
   * The single source of truth apps/web/middleware.ts calls before letting
   * a visitor reach any gated page. Public — this runs for logged-out
   * visitors on /login and /register too, so it can never require auth
   * itself. Rate-limited generously (not 5/min like login) since a real
   * page load can trigger this once per navigation until the middleware's
   * geo_status cookie is set.
   */
  @Public()
  @Post('check')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async check(@Req() req: Request, @Body() dto: GeoCheckDto): Promise<GeoCheckResponse> {
    const gps = dto.lat !== undefined && dto.lon !== undefined ? { lat: dto.lat, lon: dto.lon } : undefined;
    return this.geoCheckService.check(req.ip ?? '', null, gps);
  }
}
