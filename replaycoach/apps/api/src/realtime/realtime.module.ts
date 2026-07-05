import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Session } from '../sessions/session.entity';
import { SessionParticipant } from '../sessions/session-participant.entity';
import { RealtimeGateway } from './realtime.gateway';
import { AnnotationsModule } from '../annotations/annotations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, SessionParticipant]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiry', '15m'),
        },
      }),
    }),
    forwardRef(() => AnnotationsModule),
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
