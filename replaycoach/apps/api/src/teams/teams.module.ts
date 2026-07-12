import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Team } from './team.entity';
import { TeamMember } from './team-member.entity';
import { User } from '../users/user.entity';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

/**
 * Does NOT import OrganizationModule even though TeamsController uses
 * OrganizationGuard: that guard has no constructor dependencies, so Nest
 * instantiates it directly wherever it's referenced in @UseGuards() without
 * needing it registered as a provider here — importing OrganizationModule
 * would create a cycle (OrganizationModule needs TeamsService for the
 * org-member-removal → team cleanup cascade; see organization.module.ts).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Team, TeamMember, User])],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
