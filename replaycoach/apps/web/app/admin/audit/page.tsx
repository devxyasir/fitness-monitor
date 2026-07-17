'use client';

import { useCallback, useEffect, useState } from 'react';
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AuditLogDto } from '@replaycoach/types';
import { adminClient } from '../../../lib/admin-client';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { SkeletonRows, ErrorBlock, StateBlock } from '../../components/ui/StateBlocks';

const PAGE_SIZE = 30;

function actionLabel(action: string): string {
  return action.replace(/[._]/g, ' ');
}

export default function AdminAuditLogPage() {
  const [items, setItems] = useState<AuditLogDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminClient.listAuditLogs({
        page,
        pageSize: PAGE_SIZE,
        ...(action.trim() ? { action: action.trim() } : {}),
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load the audit log.');
    } finally {
      setLoading(false);
    }
  }, [page, action]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-m text-ink">Audit log</h1>
        <p className="text-sm text-ink-muted mt-1">{total} recorded actions.</p>
      </div>

      <div className="w-full sm:w-72">
        <Input
          id="audit-action"
          placeholder="Filter by action, e.g. user.status_changed"
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
        />
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : loading ? (
        <SkeletonRows count={10} />
      ) : items.length === 0 ? (
        <StateBlock icon={<ScrollText />} title="No activity recorded yet" body="Admin actions (role changes, suspensions, settings edits) will appear here." />
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            <div className="divide-y divide-hairline">
              {items.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink capitalize">{actionLabel(entry.action)}</div>
                    <div className="text-xs text-ink-faint truncate">
                      {entry.actorName ?? entry.actorEmail ?? 'System'}
                      {entry.resourceType && ` · ${entry.resourceType}`}
                      {entry.ipAddress && ` · ${entry.ipAddress}`}
                    </div>
                  </div>
                  <span className="text-xs text-ink-faint font-mono flex-shrink-0">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </Card>

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
