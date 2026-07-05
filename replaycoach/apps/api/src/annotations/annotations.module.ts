import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AnnotationsService } from './annotations.service';
import { AnnotationsController } from './annotations.controller';
import { Annotation, ReplayEvent, Clip } from '../database/entities/others.entities';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Annotation, ReplayEvent, Clip]),
    forwardRef(() => SessionsModule),
  ],
  controllers: [AnnotationsController],
  providers: [AnnotationsService],
  exports: [AnnotationsService],
})
export class AnnotationsModule {}
