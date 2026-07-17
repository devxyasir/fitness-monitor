'use client';

import { useCallback, useEffect, useState } from 'react';
import { Video, ChevronLeft, ChevronRight, Square } from 'lucide-react';
import type { AdminSessionDto, SessionStatus } from '@replaycoach/types';
import { adminClient } from '../../../lib/admin-client';
import { apiClient } from '../../../lib/api-client';
import { withAdminElevation } from '../../../stores/admin-elevate-store';
import { toast } from '../../../stores/toast-store';
import { Card } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { SkeletonRows, ErrorBlock, StateBlock } from '../../components/ui/StateBlocks';

const PAGE_SIZE = 20;
const STATUSES: SessionStatus[] = ['scheduled', 'live', 'ended', 'processed', 'archived'];

function statusVariant(status: SessionStatus): 'success' | 'scheduled' | 'danger' | 'ended' | 'replay' {
  if (status === 'live') return 'success';
  if (status === 'scheduled') return 'scheduled';
  if (status === 'processed') return 'replay';
  return 'ended';
}

export default function AdminSessionsPage() {
  const [items, setItems] = useState<AdminSessionDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<SessionStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminClient.listSessions({ page, pageSize: PAGE_SIZE, ...(status ? { status } : {}) });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load sessions.');
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const handleForceEnd = async (session: AdminSessionDto) => {
    if (!window.confirm(`Force-end this session (coach: ${session.coachName})? Everyone will be disconnected immediately.`)) return;
    setEnding(session.id);
    try {
      await withAdminElevation(() => apiClient.patch(`/sessions/${session.id}/status`, { status: 'ended' }));
      setItems((prev) => prev.map((s) => (s.id === session.id ? { ...s, status: 'ended' } : s)));
      toast.success('Session ended.');
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not end the session.');
    } finally {
      setEnding(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const liveNow = items.filter((s) => s.status === 'live');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-m text-ink">Sessions</h1>
        <p className="text-sm text-ink-muted mt-1">{total} total across every organization.</p>
      </div>

      {liveNow.length > 0 && (
        <div>
          <h2 className="font-display text-display-s text-ink mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success animate-ping opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            Live right now ({liveNow.length})
          </h2>
          <div className="flex flex-col gap-2">
            {liveNow.map((s) => (
              <SessionRow key={s.id} session={s} onForceEnd={handleForceEnd} ending={ending === s.id} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as SessionStatus | '');
          }}
          className="bg-panel-2 border border-hairline rounded-sm px-3 py-2.5 text-sm text-ink"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : loading ? (
        <SkeletonRows count={8} />
      ) : items.length === 0 ? (
        <StateBlock icon={<Video />} title="No sessions found" body="Try a different filter." />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {items.map((s) => (
              <SessionRow key={s.id} session={s} onForceEnd={handleForceEnd} ending={ending === s.id} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <span className="text-xs text-ink-faint font-mono">Page {page} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SessionRow({
  session,
  onForceEnd,
  ending,
}: {
  session: AdminSessionDto;
  onForceEnd: (session: AdminSessionDto) => void;
  ending: boolean;
}) {
  return (
    <Card className="flex items-center gap-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink truncate">{session.coachName}</div>
        <div className="text-xs text-ink-faint truncate">
          {session.orgName ?? 'No organization'} · {session.participantCount} participant{session.participantCount === 1 ? '' : 's'}
        </div>
      </div>
      <span className="text-xs text-ink-faint font-mono hidden sm:block">
        {new Date(session.scheduledAt).toLocaleString()}
      </span>
      <Pill variant={statusVariant(session.status)} pulse={session.status === 'live'}>{session.status}</Pill>
      {(session.status === 'live' || session.status === 'scheduled') && (
        <button
          type="button"
          disabled={ending}
          onClick={() => onForceEnd(session)}
          aria-label="Force end session"
          title="Force end session"
          className="text-ink-faint hover:text-danger transition-colors flex-shrink-0 disabled:opacity-40"
        >
          <Square className="w-4 h-4" />
        </button>
      )}
    </Card>
  );
}
