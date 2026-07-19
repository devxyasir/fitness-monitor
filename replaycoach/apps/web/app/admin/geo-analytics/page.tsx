'use client';

import { useCallback, useEffect, useState } from 'react';
import { Globe, ShieldOff, Percent, MapPinned, Download } from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { GeoStatsResponse } from '@replaycoach/types';
import { geoClient } from '../../../lib/geo-client';
import { countryNameForCode } from '../../../lib/iso-countries';
import { downloadCsv } from '../../../lib/csv-export';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Tabs } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/Button';
import { SkeletonRows, ErrorBlock, StateBlock, ChartOrEmpty } from '../../components/ui/StateBlocks';
import { CountryChoropleth } from './CountryChoropleth';

type RangeKey = '7' | '30' | '90' | 'all';
const RANGE_DAYS: Record<RangeKey, number | undefined> = { '7': 7, '30': 30, '90': 90, all: undefined };

// Design-system chart tokens (see design/DESIGN_SYSTEM.md §1.4) — allowed vs.
// blocked is a genuine status pair, but color-success/color-danger fail the
// dataviz skill's CVD-separation check when paired directly on a chart
// (ΔE 4-5, below the legal floor); chart-clay/chart-petrol — the palette's
// own first two categorical slots — pass (ΔE 9-11) and read the same way
// (warm=blocked, cool=allowed) without the colorblind risk.
const ALLOWED_COLOR = 'rgb(var(--chart-petrol))';
const BLOCKED_COLOR = 'rgb(var(--chart-clay))';
const VOLUME_COLOR = 'rgb(var(--color-analytics))';

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function AdminGeoAnalyticsPage() {
  const [range, setRange] = useState<RangeKey>('30');
  const [stats, setStats] = useState<GeoStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const days = RANGE_DAYS[range];
      const sinceIso = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : undefined;
      const res = await geoClient.getStats({ ...(sinceIso ? { since: sinceIso } : {}), dailyDays: days ?? 90 });
      setStats(res);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load geo analytics.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const donutData = stats
    ? [
        { name: 'Allowed', value: stats.totals.totalChecks - stats.totals.blockedChecks, color: ALLOWED_COLOR },
        { name: 'Blocked', value: stats.totals.blockedChecks, color: BLOCKED_COLOR },
      ]
    : [];

  const handleExport = () => {
    if (!stats) return;
    downloadCsv(
      `geo-analytics-daily-${new Date().toISOString().slice(0, 10)}.csv`,
      stats.daily.map((d) => ({ date: d.date, allowed: d.allowed, blocked: d.blocked, total: d.allowed + d.blocked })),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-m text-ink">Geo analytics</h1>
          <p className="text-sm text-ink-muted mt-1">Access-check volume, block rate, and geographic distribution.</p>
        </div>
        <Tabs
          items={[
            { key: '7', label: '7d' },
            { key: '30', label: '30d' },
            { key: '90', label: '90d' },
            { key: 'all', label: 'All' },
          ]}
          active={range}
          onChange={(k) => setRange(k as RangeKey)}
        />
      </div>

      {stats && stats.totals.totalChecks > 0 && (
        <div className="flex justify-end -mt-2">
          <Button variant="ghost" size="sm" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        </div>
      )}

      {error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : loading ? (
        <SkeletonRows count={4} />
      ) : stats && stats.totals.totalChecks === 0 ? (
        <StateBlock
          icon={<Globe />}
          title="No geo checks recorded yet"
          body="Once Geo Access Control is enabled, activity for this period will appear here."
        />
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Globe} label="Total checks" value={stats.totals.totalChecks.toLocaleString()} />
            <StatCard icon={ShieldOff} label="Blocked" value={stats.totals.blockedChecks.toLocaleString()} accent="danger" />
            <StatCard icon={Percent} label="Block rate" value={`${stats.totals.blockRate}%`} accent="danger" />
            <StatCard icon={MapPinned} label="Countries seen" value={stats.totals.distinctCountries} />
          </div>

          <Card accent="analytics">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-display-s text-ink">Checks per day</h3>
              <ChartLegend items={[{ label: 'Allowed', color: ALLOWED_COLOR }, { label: 'Blocked', color: BLOCKED_COLOR }]} />
            </div>
            <div className="h-64">
              <ChartOrEmpty data={stats.daily}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.daily} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid stroke="rgb(var(--color-hairline))" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fill: 'rgb(var(--color-ink-faint))', fontSize: 11 }}
                      axisLine={{ stroke: 'rgb(var(--color-hairline))' }}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: 'rgb(var(--color-ink-faint))', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip content={<DailyTooltip />} cursor={{ stroke: 'rgb(var(--color-hairline))', strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="allowed" name="Allowed" stroke={ALLOWED_COLOR} fill={ALLOWED_COLOR} fillOpacity={0.1} strokeWidth={2} />
                    <Area type="monotone" dataKey="blocked" name="Blocked" stroke={BLOCKED_COLOR} fill={BLOCKED_COLOR} fillOpacity={0.1} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartOrEmpty>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-display-s text-ink">Countries</h3>
              <span className="text-xs text-ink-faint">Shaded by check volume · top 10</span>
            </div>
            <ChartOrEmpty data={stats.topCountriesByVolume}>
              <CountryChoropleth data={stats.topCountriesByVolume} />
            </ChartOrEmpty>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <h3 className="font-display text-display-s text-ink mb-4">Top countries by volume</h3>
              <div className="h-64">
                <ChartOrEmpty data={stats.topCountriesByVolume}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.topCountriesByVolume} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                      <XAxis type="number" allowDecimals={false} tick={{ fill: 'rgb(var(--color-ink-faint))', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="countryCode"
                        tick={{ fill: 'rgb(var(--color-ink-muted))', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />
                      <Tooltip content={<CountryTooltip />} cursor={{ fill: 'rgb(var(--color-panel-2))' }} />
                      <Bar dataKey="count" fill={VOLUME_COLOR} radius={[0, 4, 4, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartOrEmpty>
              </div>
            </Card>

            <Card>
              <h3 className="font-display text-display-s text-ink mb-4">Allowed vs. blocked</h3>
              <div className="h-64 flex items-center gap-6">
                <ResponsiveContainer width="55%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="60%"
                      outerRadius="90%"
                      paddingAngle={2}
                      stroke="rgb(var(--color-panel))"
                      strokeWidth={2}
                    >
                      {donutData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<DonutTooltip total={stats.totals.totalChecks} />} />
                  </PieChart>
                </ResponsiveContainer>
                <ChartLegend
                  vertical
                  items={donutData.map((d) => ({ label: `${d.name} · ${d.value.toLocaleString()}`, color: d.color }))}
                />
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ChartLegend({ items, vertical }: { items: { label: string; color: string }[]; vertical?: boolean }) {
  return (
    <div className={`flex ${vertical ? 'flex-col gap-2' : 'flex-row gap-4'} text-xs text-ink-muted`}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
          {item.label}
        </div>
      ))}
    </div>
  );
}

function TooltipShell({ children }: { children: React.ReactNode }) {
  return <div className="bg-panel border border-hairline shadow-md rounded-md px-3 py-2 text-xs min-w-32">{children}</div>;
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 justify-between">
      <span className="flex items-center gap-1.5 text-ink-muted">
        <span className="w-2.5 h-[2px] flex-shrink-0" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-mono font-semibold text-ink">{value}</span>
    </div>
  );
}

function DailyTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: { dataKey: string; value: number }[];
}) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  const allowed = payload.find((p) => p.dataKey === 'allowed')?.value ?? 0;
  const blocked = payload.find((p) => p.dataKey === 'blocked')?.value ?? 0;
  return (
    <TooltipShell>
      <div className="text-ink-faint font-mono mb-1.5">{formatShortDate(label)}</div>
      <div className="space-y-1">
        <TooltipRow color={ALLOWED_COLOR} label="Allowed" value={allowed} />
        <TooltipRow color={BLOCKED_COLOR} label="Blocked" value={blocked} />
      </div>
    </TooltipShell>
  );
}

function CountryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { countryCode: string; count: number } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]!.payload;
  return (
    <TooltipShell>
      <TooltipRow color={VOLUME_COLOR} label={countryNameForCode(row.countryCode)} value={row.count} />
    </TooltipShell>
  );
}

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { value: number; payload: { name: string; color: string } }[];
  total: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]!;
  const pct = total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0;
  return (
    <TooltipShell>
      <TooltipRow color={item.payload.color} label={item.payload.name} value={`${item.value.toLocaleString()} (${pct}%)`} />
    </TooltipShell>
  );
}
