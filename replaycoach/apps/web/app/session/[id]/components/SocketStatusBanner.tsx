'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { socket } from '../../../../lib/socket-client';

/**
 * The realtime Socket.IO connection (pose overlay, replay sync, lobby,
 * annotations) is separate from LiveKit's media connection — ConnectionStatusBanner
 * only covers the latter. A dropped socket previously failed completely
 * silently: no banner, and after socket.io-client exhausts its 10
 * reconnection attempts (see lib/socket-client.ts) it just gives up forever
 * with nothing telling the user why live updates stopped.
 */
export function SocketStatusBanner() {
  const [state, setState] = useState<'connected' | 'reconnecting' | 'failed'>(
    socket.connected ? 'connected' : 'reconnecting',
  );

  useEffect(() => {
    const onConnect = () => setState('connected');
    const onDisconnect = (reason: string) => {
      // A client-initiated disconnect (e.g. page navigating away) isn't a
      // failure worth alarming the user about.
      if (reason === 'io client disconnect') return;
      setState('reconnecting');
    };
    const onReconnectFailed = () => setState('failed');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_failed', onReconnectFailed);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_failed', onReconnectFailed);
    };
  }, []);

  if (state === 'connected') return null;

  if (state === 'failed') {
    return (
      <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 bg-danger/15 border border-danger/35 text-danger text-xs font-semibold px-3.5 py-1.5 rounded-full shadow-xl backdrop-blur-glass inline-flex items-center gap-2">
        <WifiOff className="w-3.5 h-3.5" /> Live updates disconnected
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1 underline decoration-dotted hover:text-ink transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Reload
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-replay/15 border border-replay/35 text-replay text-xs font-semibold px-3.5 py-1.5 rounded-full shadow-xl backdrop-blur-glass inline-flex items-center gap-2 animate-pulse">
      <WifiOff className="w-3.5 h-3.5" /> Reconnecting live updates…
    </div>
  );
}
