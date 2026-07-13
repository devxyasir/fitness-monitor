import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Session } from '../sessions/session.entity';
import { SessionParticipant } from '../sessions/session-participant.entity';
import { Clip, PoseKeypointFrame } from '../database/entities/others.entities';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Session, SessionParticipant, Clip, PoseKeypointFrame])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
