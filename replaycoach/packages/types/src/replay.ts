import type { UserId } from './scalars';

export interface ReplaySeekRequestDto {
  participantId?: UserId;
  timestampMs: number;
}

export interface ReplaySeekResponseDto {
  manifestUrl: string;
  resolvedTimestampMs: number;
  expiresAt: string; // ISO string
}

export interface ReplayTargetRequestDto {
  studentIds: UserId[];
  participantId?: UserId;
  timestampMs: number;
}

export interface ReplayStartEventPayload {
  sessionId: string;
  manifestUrl: string;
  resolvedTimestampMs: number;
  participantId?: UserId;
}

export interface ReplaySeekEventPayload {
  seekMs: number;
}
