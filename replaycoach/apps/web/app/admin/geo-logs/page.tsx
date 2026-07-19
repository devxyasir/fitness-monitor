'use client';

import { useCallback, useEffect, useState } from 'react';
import { Globe, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { GeoAccessLogDto, GeoAccessLogListQuery } from '@replaycoach/types';
import { geoClient } from '../../../lib/geo-client';
import { countryNameForCode } from '../../../lib/iso-countries';
import { downloadCsv } from '../../../lib/csv-export';
import { toast } from '../../../stores/toast-store';
import { Card } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { Tabs } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/Button';
import { SkeletonRows, ErrorBlock, StateBlock } from '../../components/ui/StateBlocks';

const PAGE_SIZE = 30;
// A CSV export loops pages server-side at this cap (the API's own max
// pageSize) instead of the UI's 30 — bounded to ~20 pages (2,000 rows) so a
// runaway export can't hammer the endpoint indefinitely.
const EXPORT_PAGE_SIZE = 100;
const EXPORT_MAX_PAGES = 20;
type AllowedFilter = 'all' | 'allowed' | 'blocked';

function reasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  return reason.replace(/_/g, ' ');
}

export default function AdminGeoLogsPage() {
  const [items, setItems] = useState<GeoAccessLogDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<AllowedFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await geoClient.listLogs({
        page,
        pageSize: PAGE_SIZE,
        ...(filter !== 'all' ? { allowed: filter === 'allowed' } : {}),
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load the geo access log.');
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleExport = async () => {
    setExporting(true);
    try {
      const baseQuery: GeoAccessLogListQuery = {
        pageSize: EXPORT_PAGE_SIZE,
        ...(filter !== 'all' ? { allowed: filter === 'allowed' } : {}),
      };
      const rows: Record<string, string | number | boolean>[] = [];
      for (let p = 1; p <= EXPORT_MAX_PAGES; p++) {
        const res = await geoClient.listLogs({ ...baseQuery, page: p });
        for (const entry of res.items) {
          rows.push({
            createdAt: entry.createdAt,
            countryCode: entry.countryCode ?? '',
            country: entry.countryCode ? countryNameForCode(entry.countryCode) : 'Unknown',
            region: entry.region ?? '',
            city: entry.city ?? '',
            ip: entry.ip,
            detectionMethod: entry.detectionMethod,
            allowed: entry.allowed,
            reason: entry.reason ?? '',
          });
        }
        if (res.items.length < EXPORT_PAGE_SIZE || p * EXPORT_PAGE_SIZE >= res.total) break;
      }
      if (rows.length === 0) {
        toast.error('No rows to export for the current filter.');
        return;
      }
      downloadCsv(`geo-access-log-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-m text-ink">Geo access log</h1>
          <p className="text-sm text-ink-muted mt-1">{total} recorded location checks.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleExport} loading={exporting} disabled={total === 0}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>

      <Tabs
        items={[
          { key: 'all', label: 'All' },
          { key: 'allowed', label: 'Allowed' },
          { key: 'blocked', label: 'Blocked' },
        ]}
        active={filter}
        onChange={(k) => {
          setPage(1);
          setFilter(k as AllowedFilter);
        }}
      />

      {error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : loading ? (
        <SkeletonRows count={10} />
      ) : items.length === 0 ? (
        <StateBlock
          icon={<Globe />}
          title="No geo checks recorded yet"
          body="Once Geo Access Control is enabled, every location decision (allowed or blocked) will appear here."
        />
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            <div className="divide-y divide-hairline">
              {items.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink flex items-center gap-2">
                      {entry.countryCode ? countryNameForCode(entry.countryCode) : 'Unknown location'}
                      <Pill variant={entry.allowed ? 'success' : 'danger'}>{entry.allowed ? 'Allowed' : 'Blocked'}</Pill>
                    </div>
                    <div className="text-xs text-ink-faint truncate">
                      {entry.ip}
                      {entry.region && ` · ${entry.region}`}
                      {entry.city && ` · ${entry.city}`}
                      {` · ${entry.detectionMethod.toUpperCase()}`}
                      {reasonLabel(entry.reason) && ` · ${reasonLabel(entry.reason)}`}
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
