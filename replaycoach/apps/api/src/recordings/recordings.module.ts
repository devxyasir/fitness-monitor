import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Recording } from '../database/entities/others.entities';
import { SessionsModule } from '../sessions/sessions.module';
import { MediaModule } from '../media/media.module';
import { RecordingsService } from './recordings.service';
import { RecordingsController } from './recordings.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Recording]),
    SessionsModule,
    // MediaModule already imports RecordingsModule (for EgressService to
    // record status updates) — forwardRef breaks the resulting cycle.
    forwardRef(() => MediaModule),
  ],
  controllers: [RecordingsController],
  providers: [RecordingsService],
  exports: [RecordingsService],
})
export class RecordingsModule {}
