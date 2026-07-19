import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { MediaModule } from '../media/media.module';
import { ReferenceModule } from '../reference/reference.module';
import { Session } from '../sessions/session.entity';
import {
  Clip,
  ClipShare,
  Annotation,
  Recording,
} from '../database/entities/others.entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, Recording, Clip, ClipShare, Annotation]),
    // Both are plain (non-forwardRef) edges into the same
    // Sessions/Media/Recordings/Realtime/Reference/Annotations/Clips require
    // cycle that ReferenceModule and AnnotationsModule already document —
    // forwardRef here for the same reason: which side of the cycle Node
    // resolves first is entry-point-dependent, and a plain reference bakes
    // in `undefined` permanently if this file loads before the other
    // finishes exporting.
    forwardRef(() => MediaModule),
    forwardRef(() => ReferenceModule),
  ],
  controllers: [ClipsController],
  providers: [ClipsService],
  exports: [ClipsService],
})
export class ClipsModule {}
