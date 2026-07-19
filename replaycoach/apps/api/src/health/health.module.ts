import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [MediaModule],
  providers: [HealthService],
  controllers: [HealthController],
  exports: [HealthService],
})
export class HealthModule {}
