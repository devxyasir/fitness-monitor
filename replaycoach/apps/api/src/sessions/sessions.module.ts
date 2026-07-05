import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Session } from './session.entity';
import { SessionParticipant } from './session-participant.entity';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { SessionsGuard } from './sessions.guard';
import { User } from '../users/user.entity';
import { MediaModule } from '../media/media.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PoseModule } from '../pose/pose.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, SessionParticipant, User]),
    forwardRef(() => MediaModule),
    forwardRef(() => RealtimeModule),
    PoseModule,
  ],
  providers: [SessionsService, SessionsGuard],
  controllers: [SessionsController],
  exports: [SessionsService, SessionsGuard],
})
export class SessionsModule {}
