import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import { Session } from '../sessions/session.entity';
import { UserModule } from '../users/user.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminSessionsController } from './admin-sessions.controller';
import { AdminAuditController } from './admin-audit.controller';
import { AdminUserSecurityController } from './admin-user-security.controller';

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
    TypeOrmModule.forFeature([User, Organization, Session]),
    UserModule,
    AuthModule,
    AuditModule,
    SessionsModule,
  ],
  providers: [AdminDashboardService],
  controllers: [
    AdminDashboardController,
    AdminSessionsController,
    AdminAuditController,
    AdminUserSecurityController,
  ],
})
export class AdminModule {}
