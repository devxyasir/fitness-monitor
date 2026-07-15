/**
 * org-client — typed calls for organization/team/invite management.
 * Wraps apiClient (see api-client.ts) the same way every other domain client
 * does; kept separate from auth-client.ts since this is organization-domain,
 * not session/token-domain.
 */

import type {
  CreateInviteResponse,
  CreateOrganizationDto,
  InvitePreviewDto,
  InviteToOrgDto,
  OrganizationDto,
  OrgInviteDto,
  UpdateOrganizationDto,
  UserDto,
} from '@replaycoach/types';
import { apiClient } from './api-client';

async function createOrganization(dto: CreateOrganizationDto): Promise<OrganizationDto> {
  return apiClient.post('/organizations', dto);
}

async function getOrganization(orgId: string): Promise<OrganizationDto> {
  return apiClient.get(`/organizations/${orgId}`);
}

async function updateOrganization(orgId: string, dto: UpdateOrganizationDto): Promise<OrganizationDto> {
  return apiClient.patch(`/organizations/${orgId}`, dto);
}

async function listMembers(orgId: string): Promise<UserDto[]> {
  return apiClient.get(`/organizations/${orgId}/members`);
}

async function removeMember(orgId: string, userId: string): Promise<void> {
  return apiClient.del(`/organizations/${orgId}/members/${userId}`);
}

async function createInvite(orgId: string, dto: InviteToOrgDto): Promise<CreateInviteResponse> {
  return apiClient.post(`/organizations/${orgId}/invite`, dto);
}

async function listInvites(orgId: string): Promise<OrgInviteDto[]> {
  return apiClient.get(`/organizations/${orgId}/invites`);
}

async function revokeInvite(orgId: string, inviteId: string): Promise<void> {
  return apiClient.del(`/organizations/${orgId}/invites/${inviteId}`);
}

async function resendInvite(orgId: string, inviteId: string): Promise<CreateInviteResponse> {
  return apiClient.post(`/organizations/${orgId}/invites/${inviteId}/resend`, {});
}

/** Public — no auth required, works for a logged-out visitor. */
async function getInvitePreview(token: string): Promise<InvitePreviewDto> {
  return apiClient.get(`/invites/${token}`);
}

/** Requires the caller to already be logged in with an account whose email
 * matches the invite. */
async function acceptInvite(token: string): Promise<UserDto> {
  return apiClient.post(`/invites/${token}/accept`, {});
}

export const orgClient = {
  createOrganization,
  getOrganization,
  updateOrganization,
  listMembers,
  removeMember,
  createInvite,
  listInvites,
  revokeInvite,
  resendInvite,
  getInvitePreview,
  acceptInvite,
};
