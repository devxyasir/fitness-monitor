import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import type { OrganizationDto } from '@replaycoach/types';

import { Organization } from './organization.entity';
import { OrgInvite } from './org-invite.entity';
import type { CreateOrganizationDto, InviteToOrgDto } from './organization.dto';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrgInvite)
    private readonly inviteRepo: Repository<OrgInvite>,
  ) {}

  async create(dto: CreateOrganizationDto, createdByUserId: string): Promise<Organization> {
    void createdByUserId; // future: store creator reference
    const org = this.orgRepo.create({ name: dto.name });
    return this.orgRepo.save(org);
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  /**
   * Creates an invite token (raw UUID) and stores it.
   * NOTE: Email sending is a future phase — the raw token is returned to the caller
   * so callers can surface it in tests/dev. In production, this would be emailed only.
   */
  async createInvite(
    orgId: string,
    inviterUserId: string,
    inviterRole: string,
    dto: InviteToOrgDto,
  ): Promise<{ inviteToken: string }> {
    // Only studio_admin/platform_admin can invite
    if (!['studio_admin', 'platform_admin'].includes(inviterRole)) {
      throw new ForbiddenException('Only studio admins can invite members');
    }

    await this.findById(orgId); // ensures org exists

    const rawToken = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = this.inviteRepo.create({
      orgId,
      invitedEmail: dto.email,
      role: dto.role,
      // Store raw token (hashing deferred to when email infra is added)
      inviteToken: rawToken,
      invitedBy: inviterUserId,
      expiresAt,
      usedAt: null,
    });
    await this.inviteRepo.save(invite);

    return { inviteToken: rawToken };
  }

  toDto(org: Organization): OrganizationDto {
    return {
      id: org.id,
      name: org.name,
      planTier: org.planTier,
      createdAt: org.createdAt.toISOString(),
    };
  }
}
