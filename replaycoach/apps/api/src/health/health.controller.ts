import { Controller, Get } from '@nestjs/common';

import type { HealthResponse } from '@replaycoach/types';

import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
