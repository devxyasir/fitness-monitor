import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Recording } from '../database/entities/others.entities';
import { RecordingsService } from './recordings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Recording])],
  providers: [RecordingsService],
  exports: [RecordingsService],
})
export class RecordingsModule {}
