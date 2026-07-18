import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Annotation, Clip, ClipShare, ReferenceVideo, TrackedAnnotation } from '../database/entities/others.entities';
import { SessionParticipant } from '../sessions/session-participant.entity';
import { SessionsModule } from '../sessions/sessions.module';
import { RealtimeModule } from '../realtime/realtime.module';

import { ReferenceController, ReferenceMediaController } from './reference.controller';
import { ReferenceService } from './reference.service';
import { ReferenceStorageService } from './reference-storage.service';
import { ReferenceExportQueueClient } from './reference-export-queue.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferenceVideo, Clip, ClipShare, Annotation, TrackedAnnotation, SessionParticipant]),
    // AnnotationsModule now imports ClipsModule (which imports this module),
    // and AnnotationsModule already sits in a require cycle with
    // SessionsModule — that makes ClipsModule -> ReferenceModule -> here a
    // second path back into the same cycle. Unlike a forwardRef'd usage
    // elsewhere, a *plain* reference here is evaluated the instant this
    // file's top-level @Module({...}) decorator runs, so if SessionsModule
    // hadn't finished exporting yet at that exact point in the require
    // chain, it would bake `undefined` into this array permanently.
    forwardRef(() => SessionsModule),
    forwardRef(() => RealtimeModule),
  ],
  controllers: [ReferenceController, ReferenceMediaController],
  providers: [ReferenceService, ReferenceStorageService, ReferenceExportQueueClient],
  exports: [ReferenceService, ReferenceStorageService],
})
export class ReferenceModule {}
