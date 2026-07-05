import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferenceVideo } from '../database/entities/others.entities';

@Module({
  imports: [TypeOrmModule.forFeature([ReferenceVideo])],
  exports: [TypeOrmModule],
})
export class ReferenceModule {}
