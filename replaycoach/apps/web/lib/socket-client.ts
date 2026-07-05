import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export function getSocketUrl(): string {
  return SOCKET_URL;
}

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 8,
  reconnectionDelay: 2000,
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

export function connectSocket(token: string) {
  const currentToken = (socket.auth as any)?.token;
  
  if (currentToken === token && (socket.connected || (socket as any).connecting)) {
    return;
  }

  socket.auth = { token };

  if (socket.connected) {
    console.log('[Socket.IO] Reconnecting due to authentication token change');
    socket.disconnect();
  }

  console.log('[Socket.IO] Triggering socket connection attempt...');
  socket.connect();
}

export function disconnectSocket() {
  if (socket.connected) {
    console.log('[Socket.IO] Disconnecting socket...');
    socket.disconnect();
  }
}
