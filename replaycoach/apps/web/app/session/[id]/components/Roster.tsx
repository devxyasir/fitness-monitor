'use client';
import { useEffect, useRef, useState } from 'react';
import { useParticipants } from '@livekit/components-react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
}

/** Pose-service subscriber bots — never show these in the roster. */
function isPoseWorkerIdentity(identity: string): boolean {
  return identity.startsWith('pose_worker_');
}

/**
 * Live "who's in the call" roster: header count, collapsible name list, and
 * join/leave toasts. Must render inside <LiveKitRoom>.
 */
export function Roster() {
  const participants = useParticipants();
  const realParticipants = participants.filter((p) => !isPoseWorkerIdentity(p.identity));

  const [expanded, setExpanded] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prevIdentitiesRef = useRef<Set<string> | null>(null);
  const nameByIdentityRef = useRef<Map<string, string>>(new Map());

  const pushToast = (message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  };

  useEffect(() => {
    for (const p of realParticipants) {
      nameByIdentityRef.current.set(p.identity, p.name || p.identity);
    }

    const currentIdentities = new Set(realParticipants.map((p) => p.identity));
    const prevIdentities = prevIdentitiesRef.current;

    if (prevIdentities) {
      for (const identity of currentIdentities) {
        if (!prevIdentities.has(identity)) {
          pushToast(`${nameByIdentityRef.current.get(identity) ?? identity} joined`);
        }
      }
      for (const identity of prevIdentities) {
        if (!currentIdentities.has(identity)) {
          pushToast(`${nameByIdentityRef.current.get(identity) ?? identity} left`);
        }
      }
    }

    prevIdentitiesRef.current = currentIdentities;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realParticipants.map((p) => p.identity).join(',')]);

  return (
    <div className="absolute left-6 top-20 z-40 flex flex-col items-start gap-2">
      <div className="bg-slate-900/95 border border-slate-800 rounded-xl shadow-xl backdrop-blur">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-200"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {realParticipants.length} in call
          <span className="text-slate-500">{expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</span>
        </button>
        {expanded && (
          <ul className="border-t border-slate-800 px-3 py-2 flex flex-col gap-1 max-h-52 overflow-y-auto min-w-[10rem]">
            {realParticipants.map((p) => (
              <li key={p.identity} className="text-xs text-slate-300 truncate">
                {p.name || p.identity}
                {p.isLocal && <span className="text-slate-500"> (you)</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-slate-900/95 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 shadow-lg animate-pulse"
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
