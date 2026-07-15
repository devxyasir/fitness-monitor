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
    // Both are circular (SessionsModule -> MediaModule -> RecordingsModule
    // -> SessionsModule/MediaModule) — forwardRef on all three sides
    // (here and in media.module.ts / sessions.module.ts) breaks the cycle.
    forwardRef(() => SessionsModule),
    forwardRef(() => MediaModule),
  ],
  controllers: [RecordingsController],
  providers: [RecordingsService],
  exports: [RecordingsService],
})
export class RecordingsModule {}
