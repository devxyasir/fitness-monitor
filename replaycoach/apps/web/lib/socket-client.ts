import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export function getSocketUrl(): string {
  return SOCKET_URL;
}

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  // Allow polling as a fallback; Socket.IO upgrades to websocket when possible.
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
});

// Debug event listeners
socket.on('connect', () => {
  console.log('[Socket.IO] Connected successfully to API Gateway');
});

socket.on('disconnect', (reason) => {
  console.warn('[Socket.IO] Disconnected from API Gateway. Reason:', reason);
});

socket.on('connect_error', (error) => {
  console.error('[Socket.IO] Connect error:', error.message || error);
});

/**
 * Connect (or reconnect) with the current access token.
 * Refuses to connect without a token — an unauthenticated socket is dropped
 * by the server immediately, which surfaces as "failed to connect".
 */
export function connectSocket(token: string | null | undefined): void {
  if (!token) {
    // No valid token yet — do not attempt. Caller should retry once auth is ready.
    return;
  }

  const currentToken = (socket.auth as { token?: string } | undefined)?.token;

  // Already connected/connecting with the same token → nothing to do.
  if (currentToken === token && socket.active) return;

  socket.auth = { token };

  // If a socket is live under an old token, restart it so the new token is used
  // in the handshake.
  if (socket.active) {
    console.log('[Socket.IO] Reconnecting due to authentication token change');
    socket.disconnect();
  }

  console.log('[Socket.IO] Triggering socket connection attempt...');
  socket.connect();
}

export function disconnectSocket(): void {
  if (socket.active) {
    console.log('[Socket.IO] Disconnecting socket...');
    socket.disconnect();
  }
}
