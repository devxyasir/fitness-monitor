import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Organization } from './organization.entity';
import { OrgInvite } from './org-invite.entity';
import { User } from '../users/user.entity';
import { UserModule } from '../users/user.module';
import { TeamsModule } from '../teams/teams.module';
import { EmailModule } from '../email/email.module';
import { OrganizationController } from './organization.controller';
import { InvitesController } from './invites.controller';
import { OrganizationService } from './organization.service';
import { OrganizationGuard } from './organization.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, OrgInvite, User]),
    UserModule,
    TeamsModule,
    EmailModule,
  ],
  providers: [OrganizationService, OrganizationGuard],
  controllers: [OrganizationController, InvitesController],
  exports: [OrganizationService, OrganizationGuard],
})
export class OrganizationModule {}
