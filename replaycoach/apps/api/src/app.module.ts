import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
import { Team } from './teams/team.entity';
import { TeamMember } from './teams/team-member.entity';
import {
  Recording,
  PoseKeypointFrame,
  ReplayEvent,
  Clip,
  Annotation,
  ClipShare,
  Subscription,
  AuditLog,
  ReferenceVideo,
  TrackedAnnotation,
} from './database/entities/others.entities';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UserModule } from './users/user.module';
import { OrganizationModule } from './organizations/organization.module';
import { TeamsModule } from './teams/teams.module';
import { HealthModule } from './health/health.module';
import { SessionsModule } from './sessions/sessions.module';
import { MediaModule } from './media/media.module';
import { ReplayModule } from './replay/replay.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AnnotationsModule } from './annotations/annotations.module';
import { PoseModule } from './pose/pose.module';
import { ClipsModule } from './clips/clips.module';
import { RecordingsModule } from './recordings/recordings.module';
import { ReferenceModule } from './reference/reference.module';
import { DashboardModule } from './dashboard/dashboard.module';

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
        extra: {
          max: 20,
          idleTimeoutMillis: 30000,
        },
        entities: [
          Organization,
          OrgInvite,
          User,
          RefreshToken,
          Session,
          SessionParticipant,
          Team,
          TeamMember,
          Recording,
          PoseKeypointFrame,
          ReplayEvent,
          Clip,
          Annotation,
          ClipShare,
          Subscription,
          AuditLog,
          ReferenceVideo,
          TrackedAnnotation,
        ],
        migrations: [],
      }),
    }),

    // Domain modules
    AuthModule,
    UserModule,
    OrganizationModule,
    TeamsModule,
    HealthModule,
    SessionsModule,
    MediaModule,
    ReplayModule,
    RealtimeModule,
    AnnotationsModule,
    PoseModule,
    ClipsModule,
    RecordingsModule,
    ReferenceModule,
    DashboardModule,
  ],
  providers: [
    // Global by default: every route requires a valid access token and
    // passes any @Roles() check, unless explicitly marked @Public(). Closes
    // the "a new controller forgot to add JwtAuthGuard" class of gap —
    // existing per-controller @UseGuards(...) declarations still work
    // exactly as before, this just adds a safety net underneath them.
     { provide: APP_GUARD, useClass: JwtAuthGuard },
     { provide: APP_GUARD, useClass: RolesGuard },
     { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
