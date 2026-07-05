import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PoseKeypointFrame, Recording } from '../database/entities/others.entities';
import { Session } from '../sessions/session.entity';
import { SessionParticipant } from '../sessions/session-participant.entity';

import { PoseService } from './pose.service';
import { PoseController } from './pose.controller';
import { PoseRelayService } from './pose-relay.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PoseKeypointFrame, Recording, Session, SessionParticipant]),
    RealtimeModule,
  ],
  controllers: [PoseController],
  providers: [PoseService, PoseRelayService],
  exports: [PoseService],
})
export class PoseModule {}
