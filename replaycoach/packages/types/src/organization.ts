export interface OrganizationDto {
  id: string;
  name: string;
  planTier: string;
  createdAt: string;
}

export interface CreateOrganizationDto {
  name: string;
}

export interface InviteDto {
  email: string;
  role: 'coach' | 'student';
}
