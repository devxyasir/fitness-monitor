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

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, SessionParticipant, User]),
    MediaModule,
    forwardRef(() => RealtimeModule),
  ],
  providers: [SessionsService, SessionsGuard],
  controllers: [SessionsController],
  exports: [SessionsService, SessionsGuard],
})
export class SessionsModule {}
