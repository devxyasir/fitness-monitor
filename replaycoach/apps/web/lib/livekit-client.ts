import { useAuthStore } from '../stores/auth-store';

const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

/**
 * The LiveKit connection URL is authoritative from the server (the `url`
 * field on JoinSessionResponse, sourced from LIVEKIT_URL on the API) — NOT
 * from a frontend env var. There used to be a NEXT_PUBLIC_LIVEKIT_URL-backed
 * getLiveKitUrl() here, but nothing ever called it; its presence made it look
 * like changing that frontend var would repoint the connection; it doesn't.
 * Only apps/api's LIVEKIT_URL env matters — update it there.
 */
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
