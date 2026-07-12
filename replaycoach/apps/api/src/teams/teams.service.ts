import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import type { JwtPayload, TeamDto, TeamMemberDto } from '@replaycoach/types';

import { User } from '../users/user.entity';
import { Team } from './team.entity';
import { TeamMember } from './team-member.entity';
import type { AddTeamMemberDto, CreateTeamDto, UpdateTeamDto } from './teams.dto';

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(TeamMember)
    private readonly memberRepo: Repository<TeamMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /** studio_admin/platform_admin of this org only. OrganizationGuard already
   * confirmed the acting user belongs to (or is platform_admin over) this
   * org — this narrows further to "as an admin," not just any member. */
  private assertOrgAdmin(orgId: string, actingUser: JwtPayload): void {
    if (actingUser.role === 'platform_admin') return;
    if (actingUser.role === 'studio_admin' && actingUser.orgId === orgId) return;
    throw new ForbiddenException('Only an organization admin can do this');
  }

  private async isTeamLead(teamId: string, userId: string): Promise<boolean> {
    const row = await this.memberRepo.findOne({ where: { teamId, userId, role: 'lead' } });
    return row !== null;
  }

  /** Org admins can manage any team in their org; a team lead can also
   * manage membership of their own team (but nothing else — renaming or
   * deleting the team still requires assertOrgAdmin). */
  private async assertCanManageMembership(
    orgId: string,
    teamId: string,
    actingUser: JwtPayload,
  ): Promise<void> {
    if (actingUser.role === 'platform_admin') return;
    if (actingUser.role === 'studio_admin' && actingUser.orgId === orgId) return;
    if (await this.isTeamLead(teamId, actingUser.sub)) return;
    throw new ForbiddenException('Only an organization admin or team lead can manage membership');
  }

  private async findTeamOrThrow(orgId: string, teamId: string): Promise<Team> {
    const team = await this.teamRepo.findOne({ where: { id: teamId, orgId } });
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  async createTeam(orgId: string, dto: CreateTeamDto, actingUser: JwtPayload): Promise<TeamDto> {
    this.assertOrgAdmin(orgId, actingUser);
    const team = this.teamRepo.create({ orgId, name: dto.name, createdBy: actingUser.sub });
    await this.teamRepo.save(team);
    return this.toDto(team, 0);
  }

  async listTeams(orgId: string): Promise<TeamDto[]> {
    const teams = await this.teamRepo.find({ where: { orgId }, order: { createdAt: 'DESC' } });
    if (teams.length === 0) return [];

    const counts = await this.memberRepo
      .createQueryBuilder('m')
      .select('m.team_id', 'teamId')
      .addSelect('COUNT(*)', 'count')
      .where('m.team_id IN (:...ids)', { ids: teams.map((t) => t.id) })
      .groupBy('m.team_id')
      .getRawMany<{ teamId: string; count: string }>();
    const countByTeam = new Map(counts.map((c) => [c.teamId, parseInt(c.count, 10)]));

    return teams.map((t) => this.toDto(t, countByTeam.get(t.id) ?? 0));
  }

  async getTeam(orgId: string, teamId: string): Promise<{ team: TeamDto; members: TeamMemberDto[] }> {
    const team = await this.findTeamOrThrow(orgId, teamId);
    const members = await this.memberRepo.find({
      where: { teamId },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
    });
    return {
      team: this.toDto(team, members.length),
      members: members.map((m) => this.memberToDto(m)),
    };
  }

  async updateTeam(orgId: string, teamId: string, dto: UpdateTeamDto, actingUser: JwtPayload): Promise<TeamDto> {
    this.assertOrgAdmin(orgId, actingUser);
    const team = await this.findTeamOrThrow(orgId, teamId);
    if (dto.name !== undefined) team.name = dto.name;
    await this.teamRepo.save(team);
    const count = await this.memberRepo.count({ where: { teamId } });
    return this.toDto(team, count);
  }

  async deleteTeam(orgId: string, teamId: string, actingUser: JwtPayload): Promise<void> {
    this.assertOrgAdmin(orgId, actingUser);
    await this.findTeamOrThrow(orgId, teamId);
    await this.teamRepo.delete({ id: teamId, orgId });
  }

  async addMember(
    orgId: string,
    teamId: string,
    dto: AddTeamMemberDto,
    actingUser: JwtPayload,
  ): Promise<TeamMemberDto> {
    await this.findTeamOrThrow(orgId, teamId);
    await this.assertCanManageMembership(orgId, teamId, actingUser);

    const targetUser = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!targetUser) throw new NotFoundException('User not found');
    if (targetUser.orgId !== orgId) {
      throw new BadRequestException('User does not belong to this organization');
    }

    const existing = await this.memberRepo.findOne({ where: { teamId, userId: dto.userId } });
    if (existing) throw new BadRequestException('User is already a member of this team');

    const member = this.memberRepo.create({ teamId, userId: dto.userId, role: dto.role ?? 'member' });
    await this.memberRepo.save(member);
    member.user = targetUser;
    return this.memberToDto(member);
  }

  async removeMember(orgId: string, teamId: string, userId: string, actingUser: JwtPayload): Promise<void> {
    await this.findTeamOrThrow(orgId, teamId);
    await this.assertCanManageMembership(orgId, teamId, actingUser);
    await this.memberRepo.delete({ teamId, userId });
  }

  /**
   * Internal use only (invite acceptance/registration) — the caller has
   * already been authorized via a different mechanism (a redeemed,
   * email-matched invite token), so this deliberately skips the
   * org-admin/team-lead check addMember() enforces for direct API calls.
   * Idempotent: joining a team the user is already on is a no-op, not an
   * error, since this can be reached from more than one place.
   */
  async addMemberSystem(orgId: string, teamId: string, userId: string): Promise<void> {
    await this.findTeamOrThrow(orgId, teamId);
    const existing = await this.memberRepo.findOne({ where: { teamId, userId } });
    if (existing) return;
    const member = this.memberRepo.create({ teamId, userId, role: 'member' });
    await this.memberRepo.save(member);
  }

  /** Removes the user from every team in an org — used when a member is
   * removed from the org entirely, so they don't linger in team rosters
   * they no longer have any right to be part of. */
  async removeUserFromAllOrgTeams(orgId: string, userId: string): Promise<void> {
    const teams = await this.teamRepo.find({ where: { orgId }, select: ['id'] });
    if (teams.length === 0) return;
    await this.memberRepo.delete({ teamId: In(teams.map((t) => t.id)), userId });
  }

  private toDto(team: Team, memberCount: number): TeamDto {
    return {
      id: team.id,
      orgId: team.orgId,
      name: team.name,
      createdBy: team.createdBy,
      memberCount,
      createdAt: team.createdAt.toISOString(),
    };
  }

  private memberToDto(member: TeamMember): TeamMemberDto {
    return {
      id: member.id,
      teamId: member.teamId,
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
      user: member.user
        ? { displayName: member.user.displayName, email: member.user.email, avatarUrl: member.user.avatarUrl }
        : null,
    };
  }
}
