import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import type {
  CreateInviteResponse,
  InvitePreviewDto,
  JwtPayload,
  OrganizationDto,
  OrganizationSummaryDto,
  OrgInviteDto,
  SendOrgMessageDto,
  SendOrgMessageResult,
  UserDto,
} from '@replaycoach/types';

import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { TeamsService } from '../teams/teams.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
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
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly teamsService: TeamsService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  /** Base URL for links embedded in outbound email — reuses CORS_ORIGIN
   * (already the deployed frontend's origin) rather than a second env var. */
  private buildInviteUrl(token: string): string {
    const webOrigin = this.configService.get<string>('app.corsOrigin') ?? 'http://localhost:3000';
    return `${webOrigin}/invite/${token}`;
  }

  private assertOrgAdmin(orgId: string, actingUser: JwtPayload): void {
    if (actingUser.role === 'platform_admin') return;
    if (actingUser.role === 'studio_admin' && actingUser.orgId === orgId) return;
    throw new ForbiddenException('Only an organization admin can do this');
  }

  /** Invite creation follows the org hierarchy: an admin can invite anyone
   * (coach or student) into their org; a plain coach can only invite
   * students — matching "the admin brings on coaches, coaches bring on
   * their own students" rather than requiring the admin to hand-invite
   * every single student in the studio. */
  private assertCanInvite(orgId: string, actingUser: JwtPayload, role: 'coach' | 'student'): void {
    if (actingUser.role === 'platform_admin') return;
    if (actingUser.role === 'studio_admin' && actingUser.orgId === orgId) return;
    if (actingUser.role === 'coach' && actingUser.orgId === orgId && role === 'student') return;
    throw new ForbiddenException(
      actingUser.role === 'coach'
        ? 'Coaches can invite students, but only an org admin can invite other coaches'
        : 'You do not have permission to invite people to this organization',
    );
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

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const org = queryRunner.manager.create(Organization, { name: dto.name, createdBy: actingUser.sub });
      await queryRunner.manager.save(org);

      const user = await this.userService.findById(actingUser.sub);
      user.orgId = org.id;
      if (user.role === 'coach') user.role = 'studio_admin';
      await queryRunner.manager.save(User, user);
      // The caller's current access token still carries the old role/orgId —
      // force it to be re-minted via refresh (same pattern as logout/suspend).
      await this.userService.incrementSessionVersion(user.id, queryRunner.manager.getRepository(User));

      await queryRunner.commitTransaction();
      return org;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  /** platform_admin-only cross-org view — every org plus its coach/student
   * roster counts, computed in one grouped query rather than N+1 round
   * trips per org. */
  async listAll(): Promise<OrganizationSummaryDto[]> {
    const orgs = await this.orgRepo.find({ order: { createdAt: 'DESC' } });
    if (orgs.length === 0) return [];

    const counts = await this.userRepo
      .createQueryBuilder('user')
      .select('user.orgId', 'orgId')
      .addSelect('user.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .where('user.orgId IS NOT NULL')
      .groupBy('user.orgId')
      .addGroupBy('user.role')
      .getRawMany<{ orgId: string; role: string; count: string }>();

    const countsByOrg = new Map<string, { coachCount: number; studentCount: number }>();
    for (const row of counts) {
      const entry = countsByOrg.get(row.orgId) ?? { coachCount: 0, studentCount: 0 };
      if (row.role === 'coach' || row.role === 'studio_admin') entry.coachCount += Number(row.count);
      if (row.role === 'student') entry.studentCount += Number(row.count);
      countsByOrg.set(row.orgId, entry);
    }

    return orgs.map((org) => ({
      ...this.toDto(org),
      coachCount: countsByOrg.get(org.id)?.coachCount ?? 0,
      studentCount: countsByOrg.get(org.id)?.studentCount ?? 0,
    }));
  }

  async update(id: string, dto: UpdateOrganizationDto, actingUser: JwtPayload): Promise<Organization> {
    this.assertOrgAdmin(id, actingUser);
    const org = await this.findById(id);
    if (dto.name !== undefined) org.name = dto.name;
    if (dto.settings !== undefined) org.settings = dto.settings;
    if (dto.branding !== undefined) org.branding = dto.branding;
    return this.orgRepo.save(org);
  }

  /** platform_admin only — suspends/reactivates an org. v1 deliberately
   * stays a flag: org admins/coaches see a banner, but this does not
   * cascade into locking out members' own sessions (nothing currently
   * reads that consequence chain, so building it would be speculative). */
  async setStatus(orgId: string, status: 'active' | 'suspended', actingUser: JwtPayload): Promise<Organization> {
    if (actingUser.role !== 'platform_admin') {
      throw new ForbiddenException('Only a platform admin can change an organization\'s status');
    }
    const org = await this.findById(orgId);
    const previousStatus = org.status;
    org.status = status;
    await this.orgRepo.save(org);
    void this.auditService.record(actingUser.sub, 'organization.status_changed', 'organization', orgId, {
      from: previousStatus,
      to: status,
    });
    return org;
  }

  /** platform_admin only — requires the org to already be empty (zero
   * members) so deletion never silently orphans anyone; remove/relocate
   * members first via the existing member-management flow. */
  async delete(orgId: string, actingUser: JwtPayload): Promise<void> {
    if (actingUser.role !== 'platform_admin') {
      throw new ForbiddenException('Only a platform admin can delete an organization');
    }
    const org = await this.findById(orgId);
    const memberCount = await this.userRepo.count({ where: { orgId } });
    if (memberCount > 0) {
      throw new BadRequestException('Remove every member before deleting an organization');
    }
    await this.orgRepo.delete({ id: orgId });
    void this.auditService.record(actingUser.sub, 'organization.deleted', 'organization', orgId, {
      name: org.name,
    });
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
    this.assertCanInvite(orgId, actingUser, dto.role);
    const org = await this.findById(orgId);
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

    const inviter = await this.userService.findById(actingUser.sub);
    void this.emailService.sendInviteEmail(invite.invitedEmail, {
      orgName: org.name,
      role: invite.role as 'coach' | 'student',
      inviteUrl: this.buildInviteUrl(invite.inviteToken),
      invitedByName: inviter?.displayName ?? 'Your coach',
    });

    return { inviteToken: invite.inviteToken, expiresAt: invite.expiresAt.toISOString() };
  }

  /** Org admins see/manage every invite in the org; a plain coach only
   * sees/manages the ones they personally sent (their own students) — they
   * were never allowed to invite coaches, so there's nothing else of
   * theirs to hide, but other coaches' invites aren't their business. */
  private assertCanViewOrManageInvite(orgId: string, actingUser: JwtPayload, invitedBy?: string): void {
    if (actingUser.role === 'platform_admin') return;
    if (actingUser.role === 'studio_admin' && actingUser.orgId === orgId) return;
    if (actingUser.role === 'coach' && actingUser.orgId === orgId && invitedBy === actingUser.sub) return;
    throw new ForbiddenException('You do not have permission to manage this invite');
  }

  async listInvites(orgId: string, actingUser: JwtPayload): Promise<OrgInviteDto[]> {
    this.assertCanViewOrManageInvite(orgId, actingUser, actingUser.sub);
    const isOrgAdmin = actingUser.role === 'platform_admin' || actingUser.role === 'studio_admin';
    const invites = await this.inviteRepo.find({
      where: isOrgAdmin ? { orgId } : { orgId, invitedBy: actingUser.sub },
      order: { createdAt: 'DESC' },
    });
    return invites.map((i) => this.inviteToDto(i));
  }

  async revokeInvite(orgId: string, inviteId: string, actingUser: JwtPayload): Promise<void> {
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId, orgId } });
    if (!invite) throw new NotFoundException('Invite not found');
    this.assertCanViewOrManageInvite(orgId, actingUser, invite.invitedBy);
    await this.inviteRepo.delete({ id: inviteId });
  }

  /** "Resend" rotates the token (old link stops working, fresh 7-day expiry)
   * and re-sends the email — see EmailService for what happens if SMTP
   * isn't configured (link still works either way). */
  async resendInvite(orgId: string, inviteId: string, actingUser: JwtPayload): Promise<CreateInviteResponse> {
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId, orgId } });
    if (!invite) throw new NotFoundException('Invite not found');
    this.assertCanViewOrManageInvite(orgId, actingUser, invite.invitedBy);
    if (invite.usedAt) throw new BadRequestException('Invite has already been used');

    invite.inviteToken = uuidv4();
    invite.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.inviteRepo.save(invite);

    const org = await this.findById(orgId);
    const inviter = await this.userService.findById(actingUser.sub);
    void this.emailService.sendInviteEmail(invite.invitedEmail, {
      orgName: org.name,
      role: invite.role as 'coach' | 'student',
      inviteUrl: this.buildInviteUrl(invite.inviteToken),
      invitedByName: inviter?.displayName ?? 'Your coach',
    });

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
    manager?: Repository<OrgInvite>,
  ): Promise<{ orgId: string; role: 'coach' | 'student'; teamId: string | null }> {
    const repo = manager ?? this.inviteRepo;
    const invite = await this.findInviteByToken(token, repo);
    this.assertInviteRedeemable(invite);

    if (invite.invitedEmail.toLowerCase() !== email.toLowerCase()) {
      throw new ForbiddenException('This invite was sent to a different email address');
    }

    invite.usedAt = new Date();
    await repo.save(invite);

    return { orgId: invite.orgId, role: invite.role as 'coach' | 'student', teamId: invite.teamId };
  }

  /** Called after the invited user's row exists (registration path only —
   * acceptInvite() does this inline since the user already exists there). */
  async joinTeamAfterRegistration(orgId: string, teamId: string, userId: string): Promise<void> {
    await this.teamsService.addMemberSystem(orgId, teamId, userId);
  }

  private async findInviteByToken(token: string, repo?: Repository<OrgInvite>): Promise<OrgInvite> {
    const invite = await (repo ?? this.inviteRepo).findOne({ where: { inviteToken: token } });
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
      status: org.status,
      settings: org.settings,
      branding: org.branding,
      createdBy: org.createdBy,
      createdAt: org.createdAt.toISOString(),
    };
  }

  // ─── Org/coach → member email ────────────────────────────────────────

  /** Org admins can message anyone in their org (coach or student); a plain
   * coach can only message students. Formatting (subject suffix, sign-off)
   * is fixed centrally in EmailService/org-message-email.ts — callers only
   * ever supply the raw subject/message a human typed. */
  async sendMessage(orgId: string, actingUser: JwtPayload, dto: SendOrgMessageDto): Promise<SendOrgMessageResult> {
    if (actingUser.role === 'student') {
      throw new ForbiddenException('Students cannot send messages.');
    }
    if (actingUser.role !== 'platform_admin' && actingUser.orgId !== orgId) {
      throw new ForbiddenException('You do not have permission to message this organization.');
    }
    const isOrgSender = actingUser.role === 'studio_admin' || actingUser.role === 'platform_admin';
    const org = await this.findById(orgId);
    const sender = await this.userService.findById(actingUser.sub);

    const recipients = await this.userRepo.find({ where: { id: In(dto.recipientIds), orgId } });
    const foundIds = new Set(recipients.map((r) => r.id));

    const failed: SendOrgMessageResult['failed'] = dto.recipientIds
      .filter((id) => !foundIds.has(id))
      .map((id) => ({ userId: id, reason: 'Not a member of this organization' }));

    const eligible = recipients.filter((r) => {
      if (!isOrgSender && r.role !== 'student') {
        failed.push({ userId: r.id, reason: 'Coaches can only message students' });
        return false;
      }
      return true;
    });

    let sent = 0;
    for (const recipient of eligible) {
      try {
        await this.emailService.sendOrgMessage(recipient.email, {
          orgName: org.name,
          senderKind: isOrgSender ? 'organization' : 'coach',
          senderName: sender.displayName,
          subject: dto.subject,
          message: dto.message,
        });
        sent += 1;
      } catch (err) {
        failed.push({ userId: recipient.id, reason: err instanceof Error ? err.message : 'Delivery failed' });
      }
    }

    return { sent, failed };
  }
}
