import { useAuthStore } from '../stores/auth-store';

const LIVEKIT_URL = process.env['NEXT_PUBLIC_LIVEKIT_URL'] ?? 'ws://localhost:7880';
const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export function getLiveKitUrl(): string {
  return LIVEKIT_URL;
}

export interface JoinSessionResponse {
  participant: {
    id: string;
    sessionId: string;
    userId: string;
    joinedAt: string;
    leftAt: string | null;
  };
  token: string;
  url: string;
}

/**
 * fetches a join token from POST /sessions/:id/join on the NestJS API
 * and returns it for LiveKit room connection.
 */
export async function getParticipantToken(sessionId: string): Promise<JoinSessionResponse> {
  const accessToken = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/join`, {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Failed to join session' })) as { message?: string };
    throw new Error(errorData.message ?? `Failed to join session: ${res.status}`);
  }

  return res.json() as Promise<JoinSessionResponse>;
}
