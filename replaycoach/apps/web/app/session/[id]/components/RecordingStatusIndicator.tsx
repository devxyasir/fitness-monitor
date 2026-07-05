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
      ? 'border-emerald-900 bg-emerald-950/30 text-emerald-300'
      : status === 'degraded'
        ? 'border-amber-900 bg-amber-950/30 text-amber-300'
        : 'border-slate-700 bg-slate-850 text-slate-400';

  return (
    <span
      className={`text-[10px] font-bold border px-2 py-0.5 rounded uppercase ${className}`}
      title={reason ?? label}
    >
      {label}
    </span>
  );
}
