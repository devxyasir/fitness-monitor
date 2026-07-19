'use client';

import { useCallback, useEffect, useState } from 'react';
import { Database, Server, Radio, Video, HardDrive, Film, Clapperboard } from 'lucide-react';
import type { DependencyStatus, ReadinessResponse, StorageOverviewDto } from '@replaycoach/types';
import { adminStatusClient } from '../../../lib/admin-status-client';
import { Card } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { Sparkline } from '../../components/ui/Sparkline';
import { SkeletonRows, ErrorBlock } from '../../components/ui/StateBlocks';

const DEPENDENCY_LABELS: Record<keyof ReadinessResponse['dependencies'], { label: string; icon: typeof Database }> = {
  database: { label: 'Database', icon: Database },
  redis: { label: 'Redis', icon: Server },
  poseService: { label: 'Pose service', icon: Radio },
  liveKit: { label: 'LiveKit', icon: Video },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function AdminStatusPage() {
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [storage, setStorage] = useState<StorageOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dependencies, storageOverview] = await Promise.all([
        adminStatusClient.getDependencies(),
        adminStatusClient.getStorage(),
      ]);
      setReadiness(dependencies);
      setStorage(storageOverview);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-m text-ink">Status</h1>
        <p className="text-sm text-ink-muted mt-1">Live dependency health and storage usage — point-in-time, refresh to re-check.</p>
      </div>

      {error && <ErrorBlock message={error} onRetry={load} />}

      {loading ? (
        <SkeletonRows count={3} />
      ) : (
        <>
          {readiness && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-display-s text-ink">Dependencies</h3>
                <Pill variant={readiness.status === 'ok' ? 'success' : 'danger'}>{readiness.status}</Pill>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(DEPENDENCY_LABELS) as (keyof ReadinessResponse['dependencies'])[]).map((key) => (
                  <DependencyRow key={key} name={key} status={readiness.dependencies[key]} />
                ))}
              </div>
              <p className="text-xs text-ink-faint mt-4">Checked {new Date(readiness.timestamp).toLocaleString()}</p>
            </Card>
          )}

          {storage && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard icon={HardDrive} label="Total tracked storage" value={formatBytes(storage.totalBytes)} />
                <StatCard
                  icon={Clapperboard}
                  label="Recordings"
                  value={formatBytes(storage.recordings.totalBytes)}
                  sub={`${storage.recordings.trackedRows} / ${storage.recordings.totalRows} tracked`}
                />
                <StatCard
                  icon={Film}
                  label="Reference videos"
                  value={formatBytes(storage.referenceVideos.totalBytes)}
                  sub={`${storage.referenceVideos.trackedRows} / ${storage.referenceVideos.totalRows} tracked`}
                />
              </div>

              <Card accent="analytics">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-display-s text-ink">Storage added, last 6 months</h3>
                  <Sparkline data={storage.byMonth.map((m) => m.totalBytes)} width={160} height={36} />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-muted">
                  {storage.byMonth.map((m) => (
                    <span key={m.month}>
                      {m.month}: <span className="text-ink font-mono">{formatBytes(m.totalBytes)}</span>
                    </span>
                  ))}
                </div>
              </Card>

              <Card>
                <h3 className="font-display text-display-s text-ink mb-4">By organization</h3>
                {storage.byOrg.length === 0 ? (
                  <p className="text-sm text-ink-faint">No tracked storage yet.</p>
                ) : (
                  <div className="space-y-2">
                    {storage.byOrg.map((org) => (
                      <div key={org.orgId ?? '__none__'} className="flex items-center justify-between py-2 border-b border-hairline last:border-0">
                        <span className="text-sm text-ink">{org.orgName ?? 'No organization'}</span>
                        <span className="text-sm font-mono text-ink-muted">{formatBytes(org.totalBytes)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function DependencyRow({ name, status }: { name: keyof ReadinessResponse['dependencies']; status: DependencyStatus }) {
  const { label, icon: Icon } = DEPENDENCY_LABELS[name];
  return (
    <div className="flex items-center gap-3 p-3 rounded-sm bg-panel-2 border border-hairline">
      <Icon className="w-4 h-4 text-ink-muted flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{label}</div>
        {status.detail && <div className="text-xs text-ink-faint truncate" title={status.detail}>{status.detail}</div>}
      </div>
      <Pill variant={status.status === 'ok' ? 'success' : 'danger'}>{status.status}</Pill>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Database; label: string; value: string; sub?: string }) {
  return (
    <Card accent="analytics" className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-md bg-analytics/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-analytics" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-mono font-bold text-ink truncate">{value}</div>
        <div className="text-xs text-ink-muted">{label}</div>
        {sub && <div className="text-[11px] text-ink-faint">{sub}</div>}
      </div>
    </Card>
  );
}
