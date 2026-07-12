import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AnnotationsService } from './annotations.service';
import { AnnotationsController } from './annotations.controller';
import { Annotation, ReplayEvent, Clip } from '../database/entities/others.entities';
import { SessionsModule } from '../sessions/sessions.module';
import { ClipsModule } from '../clips/clips.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Annotation, ReplayEvent, Clip]),
    forwardRef(() => SessionsModule),
    // ClipsModule -> ReferenceModule -> SessionsModule closes a require
    // cycle back through this module (via RealtimeModule) — same reason
    // SessionsModule above needs forwardRef.
    forwardRef(() => ClipsModule),
  ],
  controllers: [AnnotationsController],
  providers: [AnnotationsService],
  exports: [AnnotationsService],
})
export class AnnotationsModule {}
