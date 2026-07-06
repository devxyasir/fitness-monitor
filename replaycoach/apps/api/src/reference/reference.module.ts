import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Annotation, Clip, ClipShare, ReferenceVideo } from '../database/entities/others.entities';
import { SessionParticipant } from '../sessions/session-participant.entity';
import { SessionsModule } from '../sessions/sessions.module';
import { RealtimeModule } from '../realtime/realtime.module';

import { ReferenceController, ReferenceMediaController } from './reference.controller';
import { ReferenceService } from './reference.service';
import { ReferenceStorageService } from './reference-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferenceVideo, Clip, ClipShare, Annotation, SessionParticipant]),
    SessionsModule,
    RealtimeModule,
  ],
  controllers: [ReferenceController, ReferenceMediaController],
  providers: [ReferenceService, ReferenceStorageService],
  exports: [ReferenceService, ReferenceStorageService],
})
export class ReferenceModule {}
