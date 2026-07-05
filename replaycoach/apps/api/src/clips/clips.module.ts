import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { MediaModule } from '../media/media.module';
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
    MediaModule,
  ],
  controllers: [ClipsController],
  providers: [ClipsService],
  exports: [ClipsService],
})
export class ClipsModule {}
