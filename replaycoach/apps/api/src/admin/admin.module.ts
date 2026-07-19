import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import { Session } from '../sessions/session.entity';
import { AuditLog, Recording, ReferenceVideo } from '../database/entities/others.entities';
import { GeoAccessLog } from '../geo/geo-access-log.entity';
import { UserModule } from '../users/user.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ClipsModule } from '../clips/clips.module';
import { HealthModule } from '../health/health.module';
import { EmailLogModule } from '../email/email-log.module';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminSessionsController } from './admin-sessions.controller';
import { AdminAuditController } from './admin-audit.controller';
import { AdminUserSecurityController } from './admin-user-security.controller';
import { AdminNotificationsService } from './admin-notifications.service';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminClipsController } from './admin-clips.controller';
import { AdminStorageService } from './admin-storage.service';
import { AdminStatusController } from './admin-status.controller';
import { AdminEmailLogController } from './admin-email-log.controller';

/**
 * The dedicated admin module the platform previously lacked entirely —
 * everything here is genuinely admin-exclusive surface that doesn't belong
 * to any single domain module (cross-org dashboard aggregation, the audit
 * trail, security/session management). Domain-owned admin actions (user
 * status/role, org suspend/delete) stay in their existing controllers —
 * see UserController/OrganizationController — not fragmented in here.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Organization, Session, AuditLog, GeoAccessLog, Recording, ReferenceVideo]),
    UserModule,
    AuthModule,
    AuditModule,
    SessionsModule,
    ClipsModule,
    HealthModule,
    EmailLogModule,
  ],
  providers: [AdminDashboardService, AdminNotificationsService, AdminStorageService],
  controllers: [
    AdminDashboardController,
    AdminSessionsController,
    AdminAuditController,
    AdminUserSecurityController,
    AdminNotificationsController,
    AdminClipsController,
    AdminStatusController,
    AdminEmailLogController,
  ],
})
export class AdminModule {}
