'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, ChevronLeft, ChevronRight } from 'lucide-react';
import type { EmailLogDto } from '@replaycoach/types';
import { adminClient } from '../../../lib/admin-client';
import { Card } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { SkeletonRows, ErrorBlock, StateBlock } from '../../components/ui/StateBlocks';

const PAGE_SIZE = 30;

function kindLabel(kind: EmailLogDto['kind']): string {
  return kind === 'invite' ? 'Invite' : 'Org message';
}

export default function AdminEmailLogsPage() {
  const [items, setItems] = useState<EmailLogDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [kindFilter, setKindFilter] = useState<'' | 'invite' | 'org_message'>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'success' | 'failure'>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminClient.listEmailLogs({
        page,
        pageSize: PAGE_SIZE,
        ...(kindFilter ? { kind: kindFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load the email delivery log.');
    } finally {
      setLoading(false);
    }
  }, [page, kindFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-m text-ink">Email delivery log</h1>
        <p className="text-sm text-ink-muted mt-1">{total} send attempts — invites and organization messages.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={kindFilter}
          onChange={(e) => {
            setPage(1);
            setKindFilter(e.target.value as '' | 'invite' | 'org_message');
          }}
          className="bg-panel-2 border border-hairline rounded-sm px-3 py-2.5 text-sm text-ink"
        >
          <option value="">All kinds</option>
          <option value="invite">Invites</option>
          <option value="org_message">Org messages</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setPage(1);
            setStatusFilter(e.target.value as '' | 'success' | 'failure');
          }}
          className="bg-panel-2 border border-hairline rounded-sm px-3 py-2.5 text-sm text-ink"
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
        </select>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : loading ? (
        <SkeletonRows count={10} />
      ) : items.length === 0 ? (
        <StateBlock icon={<Mail />} title="No emails sent yet" body="Invite and organization-message send attempts will appear here." />
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            <div className="divide-y divide-hairline">
              {items.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink truncate">{entry.recipientEmail}</div>
                    <div className="text-xs text-ink-faint truncate">
                      {kindLabel(entry.kind)}
                      {entry.orgName && ` · ${entry.orgName}`}
                      {entry.triggeredByName && ` · sent by ${entry.triggeredByName}`}
                      {entry.status === 'failure' && entry.errorMessage && ` · ${entry.errorMessage}`}
                    </div>
                  </div>
                  <Pill variant={entry.status === 'success' ? 'success' : 'danger'}>{entry.status}</Pill>
                  <span className="text-xs text-ink-faint font-mono flex-shrink-0 hidden sm:block">
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
