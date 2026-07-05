import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Session } from '../sessions/session.entity';
import { ReplayEvent } from '../database/entities/others.entities';
import { SessionsModule } from '../sessions/sessions.module';
import { ReplayService } from './replay.service';
import { ReplayController } from './replay.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, ReplayEvent]),
    SessionsModule,
    RealtimeModule,
  ],
  controllers: [ReplayController],
  providers: [ReplayService],
  exports: [ReplayService],
})
export class ReplayModule {}
