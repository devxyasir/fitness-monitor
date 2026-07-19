'use client';

import { useCallback, useEffect, useState } from 'react';
import { Film, ChevronLeft, ChevronRight, EyeOff, Eye } from 'lucide-react';
import type { AdminClipDto } from '@replaycoach/types';
import { adminClipsClient } from '../../../lib/admin-clips-client';
import { withAdminElevation } from '../../../stores/admin-elevate-store';
import { toast } from '../../../stores/toast-store';
import { Card } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { SkeletonRows, ErrorBlock, StateBlock } from '../../components/ui/StateBlocks';

const PAGE_SIZE = 20;

export default function AdminClipsPage() {
  const [items, setItems] = useState<AdminClipDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hiddenFilter, setHiddenFilter] = useState<'' | 'true' | 'false'>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiding, setHiding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminClipsClient.listClips({
        page,
        pageSize: PAGE_SIZE,
        ...(hiddenFilter ? { hidden: hiddenFilter === 'true' } : {}),
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load clips.');
    } finally {
      setLoading(false);
    }
  }, [page, hiddenFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleHideToggle = async (clip: AdminClipDto) => {
    setHiding(clip.id);
    try {
      if (clip.hidden) {
        const updated = await withAdminElevation(() => adminClipsClient.unhideClip(clip.id));
        setItems((prev) => prev.map((c) => (c.id === clip.id ? updated : c)));
        toast.success('Clip unhidden.');
      } else {
        const reason = window.prompt('Reason for hiding this clip (shown in the audit log):');
        if (!reason || !reason.trim()) return;
        const updated = await withAdminElevation(() => adminClipsClient.hideClip(clip.id, reason.trim()));
        setItems((prev) => prev.map((c) => (c.id === clip.id ? updated : c)));
        toast.success('Clip hidden.');
      }
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not update visibility.');
    } finally {
      setHiding(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-m text-ink">Clips</h1>
        <p className="text-sm text-ink-muted mt-1">{total} total across every organization.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={hiddenFilter}
          onChange={(e) => {
            setPage(1);
            setHiddenFilter(e.target.value as '' | 'true' | 'false');
          }}
          className="bg-panel-2 border border-hairline rounded-sm px-3 py-2.5 text-sm text-ink"
        >
          <option value="">All clips</option>
          <option value="false">Visible only</option>
          <option value="true">Hidden only</option>
        </select>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : loading ? (
        <SkeletonRows count={8} />
      ) : items.length === 0 ? (
        <StateBlock icon={<Film />} title="No clips found" body="Try a different filter." />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {items.map((c) => (
              <ClipRow key={c.id} clip={c} onHideToggle={handleHideToggle} hiding={hiding === c.id} />
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

function ClipRow({
  clip,
  onHideToggle,
  hiding,
}: {
  clip: AdminClipDto;
  onHideToggle: (clip: AdminClipDto) => void;
  hiding: boolean;
}) {
  const effectivelyHidden = clip.hidden || clip.sessionHidden;
  return (
    <Card className={`flex items-center gap-4 py-3.5 ${effectivelyHidden ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink truncate">{clip.title}</div>
        <div className="text-xs text-ink-faint truncate">
          {clip.creatorName} · {clip.orgName ?? 'No organization'} · {clip.clipType}
          {clip.hidden && clip.hiddenReason && ` · Hidden: ${clip.hiddenReason}`}
          {!clip.hidden && clip.sessionHidden && ' · Hidden via session'}
        </div>
      </div>
      <span className="text-xs text-ink-faint font-mono hidden sm:block">
        {new Date(clip.createdAt).toLocaleString()}
      </span>
      {effectivelyHidden && <Pill variant="danger">hidden</Pill>}
      <button
        type="button"
        disabled={hiding || (clip.sessionHidden && !clip.hidden)}
        onClick={() => onHideToggle(clip)}
        aria-label={clip.hidden ? 'Unhide clip' : 'Hide clip'}
        title={
          clip.sessionHidden && !clip.hidden
            ? 'Hidden via its session — unhide the session to restore access'
            : clip.hidden
              ? 'Unhide clip'
              : 'Hide clip'
        }
        className="text-ink-faint hover:text-ink transition-colors flex-shrink-0 disabled:opacity-40"
      >
        {clip.hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
    </Card>
  );
}
