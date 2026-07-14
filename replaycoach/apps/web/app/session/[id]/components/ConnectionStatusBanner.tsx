'use client';

import { useConnectionState, useConnectionQualityIndicator, useLocalParticipant } from '@livekit/components-react';
import { ConnectionState, ConnectionQuality } from 'livekit-client';
import { WifiOff, Wifi, SignalLow, SignalMedium, SignalHigh } from 'lucide-react';

/**
 * Surfaces LiveKit's own reconnect handling — which already works (the SDK
 * retries automatically) but was previously entirely invisible: no banner,
 * no spinner, nothing to tell a participant "hang on, reconnecting" versus
 * a silently frozen call. Must render inside <LiveKitRoom>.
 */
export function ConnectionStatusBanner() {
  const state = useConnectionState();

  if (state === ConnectionState.Connected || state === ConnectionState.Disconnected) return null;

  const label =
    state === ConnectionState.Reconnecting ? 'Reconnecting…' :
    state === ConnectionState.Connecting ? 'Connecting…' :
    'Connection interrupted…';

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-replay/15 border border-replay/35 text-replay text-xs font-semibold px-3.5 py-1.5 rounded-full shadow-xl backdrop-blur-glass inline-flex items-center gap-2 animate-pulse">
      <WifiOff className="w-3.5 h-3.5" /> {label}
    </div>
  );
}

const QUALITY_CONFIG: Record<ConnectionQuality, { icon: any; className: string; label: string }> = {
  [ConnectionQuality.Excellent]: { icon: SignalHigh, className: 'text-success', label: 'Excellent connection' },
  [ConnectionQuality.Good]: { icon: SignalMedium, className: 'text-success', label: 'Good connection' },
  [ConnectionQuality.Poor]: { icon: SignalLow, className: 'text-replay', label: 'Poor connection' },
  [ConnectionQuality.Lost]: { icon: WifiOff, className: 'text-danger', label: 'Connection lost' },
  [ConnectionQuality.Unknown]: { icon: Wifi, className: 'text-ink-faint', label: 'Connection quality unknown' },
};

/** Small per-user quality dot for the local participant — the toolbar/header
 * badge, not a per-tile overlay (keeps VideoGrid unchanged). */
export function LocalConnectionQualityIndicator() {
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });
  const cfg = QUALITY_CONFIG[quality] ?? QUALITY_CONFIG[ConnectionQuality.Unknown];
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center ${cfg.className}`} title={cfg.label}>
      <Icon className="w-3.5 h-3.5" />
    </span>
  );
}
