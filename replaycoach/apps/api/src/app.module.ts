import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import configuration from './config/configuration';
import { configSchema } from './config/config.schema';

import { Organization } from './organizations/organization.entity';
import { OrgInvite } from './organizations/org-invite.entity';
import { User } from './users/user.entity';
import { RefreshToken } from './auth/refresh-token.entity';
import { Session } from './sessions/session.entity';
import { SessionParticipant } from './sessions/session-participant.entity';
import {
  Recording,
  PoseKeypointFrame,
  ReplayEvent,
  Clip,
  Annotation,
  ClipShare,
  Subscription,
  AuditLog,
} from './database/entities/others.entities';

import { AuthModule } from './auth/auth.module';
import { UserModule } from './users/user.module';
import { OrganizationModule } from './organizations/organization.module';
import { HealthModule } from './health/health.module';
import { SessionsModule } from './sessions/sessions.module';
import { MediaModule } from './media/media.module';
import { ReplayModule } from './replay/replay.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AnnotationsModule } from './annotations/annotations.module';
import { PoseModule } from './pose/pose.module';
import { ClipsModule } from './clips/clips.module';
import { RecordingsModule } from './recordings/recordings.module';

@Module({
  imports: [
    // Config — load env vars with Joi validation
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: configSchema,
    }),

    // Database — TypeORM with all entities
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.getOrThrow<string>('database.url'),
        synchronize: false,
        logging: process.env['NODE_ENV'] === 'development',
        entities: [
          Organization,
          OrgInvite,
          User,
          RefreshToken,
          Session,
          SessionParticipant,
          Recording,
          PoseKeypointFrame,
          ReplayEvent,
          Clip,
          Annotation,
          ClipShare,
          Subscription,
          AuditLog,
        ],
        migrations: [],
      }),
    }),

    // Domain modules
    AuthModule,
    UserModule,
    OrganizationModule,
    HealthModule,
    SessionsModule,
    MediaModule,
    ReplayModule,
    RealtimeModule,
    AnnotationsModule,
    PoseModule,
    ClipsModule,
    RecordingsModule,
  ],
})
export class AppModule {}
