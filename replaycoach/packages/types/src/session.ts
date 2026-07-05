import type { UserId, OrganizationId } from './scalars';

export type SessionStatus = 'scheduled' | 'live' | 'ended' | 'processed' | 'archived';
export type SessionAccessType = 'public' | 'lobby';
export type ParticipantStatus = 'pending' | 'approved' | 'rejected';

export interface SessionDto {
  id: string;
  coachId: UserId;
  orgId: OrganizationId | null;
  status: SessionStatus;
  accessType: SessionAccessType;
  inviteCode: string;
  livekitRoomName: string;
  scheduledAt: string; // ISO String
  startedAt: string | null; // ISO String
  endedAt: string | null; // ISO String
  retentionDays: number;
}

export interface CreateSessionDto {
  scheduledAt: string; // ISO String
  retentionDays?: number;
  // If true, start the session immediately (goes directly to 'live' status)
  isInstant?: boolean;
  accessType?: SessionAccessType;
}

export interface UpdateSessionDto {
  scheduledAt?: string;
  retentionDays?: number;
  accessType?: SessionAccessType;
}

export interface SessionParticipantDto {
  id: string;
  sessionId: string;
  userId: UserId;
  roleInSession: 'coach' | 'student';
  status: ParticipantStatus;
  joinedAt: string;
  leftAt: string | null;
}
