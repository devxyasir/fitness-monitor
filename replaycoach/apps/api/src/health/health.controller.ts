import { Controller, Get } from '@nestjs/common';

import type { HealthResponse } from '@replaycoach/types';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
