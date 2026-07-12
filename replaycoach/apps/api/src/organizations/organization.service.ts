import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import type {
  CreateInviteResponse,
  InvitePreviewDto,
  JwtPayload,
  OrganizationDto,
  OrgInviteDto,
  UserDto,
} from '@replaycoach/types';

import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { TeamsService } from '../teams/teams.service';
import { Organization } from './organization.entity';
import { OrgInvite } from './org-invite.entity';
import type { CreateOrganizationDto, InviteToOrgDto, UpdateOrganizationDto } from './organization.dto';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrgInvite)
    private readonly inviteRepo: Repository<OrgInvite>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly userService: UserService,
    private readonly teamsService: TeamsService,
  ) {}

  private assertOrgAdmin(orgId: string, actingUser: JwtPayload): void {
    if (actingUser.role === 'platform_admin') return;
    if (actingUser.role === 'studio_admin' && actingUser.orgId === orgId) return;
    throw new ForbiddenException('Only an organization admin can do this');
  }

  /**
   * Creates an org AND makes the creator its admin — this is the only path
   * that grants studio_admin. Previously this method created a bare org row
   * with no owner at all: the caller's `orgId` was never set, so nobody
   * could ever actually administer the org they'd just created.
   *
   * Restricted to a 'coach' with no existing org (self-service — a coach
   * spinning up their own studio) or an org-less 'studio_admin' (e.g.
   * someone previously removed from an org, starting a new one). Anyone
   * already in an org must leave/be removed first — one org per user, kept
   * simple deliberately (no multi-org membership model in this phase).
   */
  async create(dto: CreateOrganizationDto, actingUser: JwtPayload): Promise<Organization> {
    if (actingUser.orgId !== null) {
      throw new ForbiddenException('You already belong to an organization');
    }
    if (actingUser.role !== 'coach' && actingUser.role !== 'studio_admin') {
      throw new ForbiddenException('Only a coach can create an organization');
    }

    const org = this.orgRepo.create({ name: dto.name, createdBy: actingUser.sub });
    await this.orgRepo.save(org);

    const user = await this.userService.findById(actingUser.sub);
    user.orgId = org.id;
    if (user.role === 'coach') user.role = 'studio_admin';
    await this.userRepo.save(user);
    // The caller's current access token still carries the old role/orgId —
    // force it to be re-minted via refresh (same pattern as logout/suspend).
    await this.userService.incrementSessionVersion(user.id);

    return org;
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto, actingUser: JwtPayload): Promise<Organization> {
    this.assertOrgAdmin(id, actingUser);
    const org = await this.findById(id);
    if (dto.name !== undefined) org.name = dto.name;
    if (dto.settings !== undefined) org.settings = dto.settings;
    if (dto.branding !== undefined) org.branding = dto.branding;
    return this.orgRepo.save(org);
  }

  async listMembers(orgId: string): Promise<UserDto[]> {
    const members = await this.userRepo.find({ where: { orgId }, order: { createdAt: 'ASC' } });
    return members.map((m) => this.userService.toDto(m));
  }

  /** Removes a member from the org (their account itself is untouched —
   * they just become org-less and can be invited elsewhere or create their
   * own org). Also drops them from every team in this org, since team-lead
   * permissions are checked against live team_member rows — a stale one
   * would otherwise leave an ex-member able to manage that team's roster. */
  async removeMember(orgId: string, targetUserId: string, actingUser: JwtPayload): Promise<void> {
    this.assertOrgAdmin(orgId, actingUser);
    if (targetUserId === actingUser.sub) {
      throw new BadRequestException('Use a different flow to leave your own organization');
    }

    const target = await this.userService.findById(targetUserId);
    if (target.orgId !== orgId) {
      throw new NotFoundException('User is not a member of this organization');
    }

    await this.teamsService.removeUserFromAllOrgTeams(orgId, targetUserId);
    target.orgId = null;
    await this.userRepo.save(target);
    await this.userService.incrementSessionVersion(targetUserId);
  }

  // ─── Invitations ──────────────────────────────────────────────────────

  async createInvite(
    orgId: string,
    actingUser: JwtPayload,
    dto: InviteToOrgDto,
  ): Promise<CreateInviteResponse> {
    this.assertOrgAdmin(orgId, actingUser);
    await this.findById(orgId);
    if (dto.teamId) {
      await this.teamsService.getTeam(orgId, dto.teamId); // throws if not found in this org
    }

    const invite = this.inviteRepo.create({
      orgId,
      invitedEmail: dto.email.toLowerCase(),
      role: dto.role,
      teamId: dto.teamId ?? null,
      inviteToken: uuidv4(),
      invitedBy: actingUser.sub,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      usedAt: null,
    });
    await this.inviteRepo.save(invite);

    return { inviteToken: invite.inviteToken, expiresAt: invite.expiresAt.toISOString() };
  }

  async listInvites(orgId: string, actingUser: JwtPayload): Promise<OrgInviteDto[]> {
    this.assertOrgAdmin(orgId, actingUser);
    const invites = await this.inviteRepo.find({ where: { orgId }, order: { createdAt: 'DESC' } });
    return invites.map((i) => this.inviteToDto(i));
  }

  async revokeInvite(orgId: string, inviteId: string, actingUser: JwtPayload): Promise<void> {
    this.assertOrgAdmin(orgId, actingUser);
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId, orgId } });
    if (!invite) throw new NotFoundException('Invite not found');
    await this.inviteRepo.delete({ id: inviteId });
  }

  /** No email infra exists to actually re-send anything — "resend" here
   * means "the old link stops working, here's a fresh one" (new token,
   * reset expiry). The caller is responsible for sharing the new link. */
  async resendInvite(orgId: string, inviteId: string, actingUser: JwtPayload): Promise<CreateInviteResponse> {
    this.assertOrgAdmin(orgId, actingUser);
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId, orgId } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.usedAt) throw new BadRequestException('Invite has already been used');

    invite.inviteToken = uuidv4();
    invite.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.inviteRepo.save(invite);

    return { inviteToken: invite.inviteToken, expiresAt: invite.expiresAt.toISOString() };
  }

  /** Public preview (no auth) — lets the frontend show "you're invited to
   * join X as a Y" before the visitor logs in or registers. */
  async getInvitePreview(token: string): Promise<InvitePreviewDto> {
    const invite = await this.findInviteByToken(token);
    const org = await this.findById(invite.orgId);
    const team = invite.teamId ? await this.teamsService.getTeam(invite.orgId, invite.teamId).catch(() => null) : null;

    return {
      orgName: org.name,
      role: invite.role as 'coach' | 'student',
      teamName: team?.team.name ?? null,
      expired: invite.expiresAt.getTime() < Date.now(),
      alreadyUsed: invite.usedAt !== null,
    };
  }

  /** Authenticated user redeems an invite for themselves. Requires the
   * invite's email to match the caller's account email — otherwise anyone
   * who obtains a leaked link could join a stranger's org under their own
   * (different) account. */
  async acceptInvite(token: string, actingUser: JwtPayload): Promise<UserDto> {
    const invite = await this.findInviteByToken(token);
    this.assertInviteRedeemable(invite);

    const user = await this.userService.findById(actingUser.sub);
    if (user.email.toLowerCase() !== invite.invitedEmail.toLowerCase()) {
      throw new ForbiddenException('This invite was sent to a different email address');
    }

    user.orgId = invite.orgId;
    user.role = invite.role as 'coach' | 'student';
    await this.userRepo.save(user);

    if (invite.teamId) {
      await this.teamsService.addMemberSystem(invite.orgId, invite.teamId, user.id);
    }

    invite.usedAt = new Date();
    await this.inviteRepo.save(invite);
    await this.userService.incrementSessionVersion(user.id);

    return this.userService.toDto(user);
  }

  /**
   * Registration-time redemption: validates the invite for an email that
   * doesn't have an account yet (AuthService creates the user first, then
   * calls this to finish joining them to the org/team — see
   * AuthService.register). Returns the org/role/team to assign, or throws
   * if the token/email pair isn't redeemable.
   */
  async consumeInviteForRegistration(
    token: string,
    email: string,
  ): Promise<{ orgId: string; role: 'coach' | 'student'; teamId: string | null }> {
    const invite = await this.findInviteByToken(token);
    this.assertInviteRedeemable(invite);

    if (invite.invitedEmail.toLowerCase() !== email.toLowerCase()) {
      throw new ForbiddenException('This invite was sent to a different email address');
    }

    invite.usedAt = new Date();
    await this.inviteRepo.save(invite);

    return { orgId: invite.orgId, role: invite.role as 'coach' | 'student', teamId: invite.teamId };
  }

  /** Called after the invited user's row exists (registration path only —
   * acceptInvite() does this inline since the user already exists there). */
  async joinTeamAfterRegistration(orgId: string, teamId: string, userId: string): Promise<void> {
    await this.teamsService.addMemberSystem(orgId, teamId, userId);
  }

  private async findInviteByToken(token: string): Promise<OrgInvite> {
    const invite = await this.inviteRepo.findOne({ where: { inviteToken: token } });
    if (!invite) throw new NotFoundException('Invite not found');
    return invite;
  }

  private assertInviteRedeemable(invite: OrgInvite): void {
    if (invite.usedAt) throw new BadRequestException('Invite has already been used');
    if (invite.expiresAt.getTime() < Date.now()) throw new BadRequestException('Invite has expired');
  }

  private inviteToDto(invite: OrgInvite): OrgInviteDto {
    return {
      id: invite.id,
      orgId: invite.orgId,
      invitedEmail: invite.invitedEmail,
      role: invite.role as 'coach' | 'student',
      teamId: invite.teamId,
      invitedBy: invite.invitedBy,
      expiresAt: invite.expiresAt.toISOString(),
      usedAt: invite.usedAt ? invite.usedAt.toISOString() : null,
      createdAt: invite.createdAt.toISOString(),
    };
  }

  toDto(org: Organization): OrganizationDto {
    return {
      id: org.id,
      name: org.name,
      planTier: org.planTier,
      settings: org.settings,
      branding: org.branding,
      createdBy: org.createdBy,
      createdAt: org.createdAt.toISOString(),
    };
  }
}
