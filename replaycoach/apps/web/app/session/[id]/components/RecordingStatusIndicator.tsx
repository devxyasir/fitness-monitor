'use client';

import { useEffect, useState } from 'react';
import { socket } from '../../../../lib/socket-client';

type RecordingStatus = 'pending' | 'active' | 'degraded';

export function RecordingStatusIndicator() {
  const [status, setStatus] = useState<RecordingStatus>('pending');
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const handleActive = () => {
      setStatus('active');
      setReason(null);
    };

    const handleDegraded = (payload: { reason?: string }) => {
      setStatus('degraded');
      setReason(payload.reason ?? 'Recording unavailable');
    };

    socket.on('session:recording:active', handleActive);
    socket.on('session:recording:degraded', handleDegraded);

    return () => {
      socket.off('session:recording:active', handleActive);
      socket.off('session:recording:degraded', handleDegraded);
    };
  }, []);

  const label =
    status === 'active'
      ? 'Recording active'
      : status === 'degraded'
        ? 'Recording degraded'
        : 'Recording starting';

  const className =
    status === 'active'
      ? 'border-live/30 bg-live/10 text-live'
      : status === 'degraded'
        ? 'border-replay/30 bg-replay/10 text-replay'
        : 'border-hairline bg-panel-2 text-ink-faint';

  return (
    <span
      className={`text-[10px] font-mono font-semibold border px-2 py-0.5 rounded-full uppercase ${className}`}
      title={reason ?? label}
    >
      {label}
    </span>
  );
}
