'use client';
import { useEffect, useRef, useState } from 'react';
import { useParticipants } from '@livekit/components-react';
import { ChevronUp, ChevronDown, UserX } from 'lucide-react';
import { apiClient } from '../../../../lib/api-client';

interface Toast {
  id: string;
  message: string;
}

interface RosterProps {
  sessionId: string;
  isCoach: boolean;
}

/** Pose-service subscriber bots — never show these in the roster. */
function isPoseWorkerIdentity(identity: string): boolean {
  return identity.startsWith('pose_worker_');
}

/**
 * Live "who's in the call" roster: header count, collapsible name list,
 * join/leave toasts, and (coach only) a remove-participant host control.
 * Must render inside <LiveKitRoom>.
 */
export function Roster({ sessionId, isCoach }: RosterProps) {
  const participants = useParticipants();
  const realParticipants = participants.filter((p) => !isPoseWorkerIdentity(p.identity));

  const [expanded, setExpanded] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const prevIdentitiesRef = useRef<Set<string> | null>(null);
  const nameByIdentityRef = useRef<Map<string, string>>(new Map());

  const handleRemove = async (identity: string) => {
    if (!isCoach || removingId) return;
    if (!window.confirm(`Remove ${nameByIdentityRef.current.get(identity) ?? identity} from this meeting?`)) return;
    setRemovingId(identity);
    try {
      await apiClient.post(`/sessions/${sessionId}/participants/${identity}/remove`, {});
    } catch (err) {
      console.error('Failed to remove participant:', err);
    } finally {
      setRemovingId(null);
    }
  };

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
    <div className="absolute left-3 sm:left-6 top-20 z-40 flex flex-col items-start gap-2 max-w-[calc(100vw-1.5rem)]">
      <div className="bg-panel/70 backdrop-blur-glass border border-hairline rounded-lg shadow-xl">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-ink"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          {realParticipants.length} in call
          <span className="text-ink-faint">{expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</span>
        </button>
        {expanded && (
          <ul className="border-t border-hairline px-3 py-2 flex flex-col gap-1 max-h-52 overflow-y-auto min-w-[10rem]">
            {realParticipants.map((p) => (
              <li key={p.identity} className="text-xs text-ink-muted truncate flex items-center justify-between gap-2">
                <span className="truncate">
                  {p.name || p.identity}
                  {p.isLocal && <span className="text-ink-faint"> (you)</span>}
                </span>
                {isCoach && !p.isLocal && (
                  <button
                    onClick={() => handleRemove(p.identity)}
                    disabled={removingId === p.identity}
                    className="shrink-0 text-ink-faint hover:text-danger disabled:opacity-40 transition-colors"
                    title={`Remove ${p.name || p.identity}`}
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-panel/70 backdrop-blur-glass border border-hairline rounded-lg px-3 py-1.5 text-xs text-ink-muted shadow-lg animate-rise"
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
