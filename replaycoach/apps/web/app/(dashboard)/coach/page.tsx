'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Film } from 'lucide-react';
import { apiClient } from '../../../lib/api-client';
import { Sparkline } from '../../components/ui/Sparkline';
import { Pill } from '../../components/ui/Pill';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { StateBlock, ErrorBlock, ChartOrEmpty } from '../../components/ui/StateBlocks';

interface CoachStats {
  sessionsHosted: number;
  activeStudents: number;
  avgTelemetryAccuracy: number;
  replayClipsSaved: number;
}

interface Session {
  id: string;
  title: string;
  datetime: string;
  participants: number;
  status: 'Live' | 'Scheduled' | 'Ended';
}

interface Clip {
  id: string;
  title: string;
  timecode: string;
}

interface CoachOverviewResponse {
  stats: CoachStats;
  sessionsOverTime: number[];
  studentFormTrends: number[];
  liveSessions: Session[];
  recentClips: Clip[];
}

export default function CoachOverviewPage() {
  const [stats, setStats] = useState<CoachStats | null>(null);
  const [liveSessions, setLiveSessions] = useState<Session[]>([]);
  const [recentClips, setRecentClips] = useState<Clip[]>([]);
  const [sessionsOverTime, setSessionsOverTime] = useState<number[]>([]);
  const [studentFormTrends, setStudentFormTrends] = useState<number[]>([]);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOverview();
  }, [range]);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.get<CoachOverviewResponse>(`/dashboard/coach/overview?range=${range}`);
      setStats(data.stats);
      setLiveSessions(data.liveSessions);
      setRecentClips(data.recentClips);
      setSessionsOverTime(data.sessionsOverTime);
      setStudentFormTrends(data.studentFormTrends);
    } catch (err) {
      console.error(err);
      setError('Could not load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <ErrorBlock message={error} onRetry={fetchOverview} />}

      {/* Range selector */}
      <div className="flex justify-end">
        <Tabs
          items={[{ key: '7d', label: '7d' }, { key: '30d', label: '30d' }, { key: '90d', label: '90d' }]}
          active={range}
          onChange={(k) => setRange(k as typeof range)}
        />
      </div>

      {/* Stat row */}
      {loading || !stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-panel border border-hairline rounded-md p-5 h-24 animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-panel via-panel-2 to-panel" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard accent="analytics" label="Sessions hosted" value={String(stats.sessionsHosted)} sparkData={sessionsOverTime} sparkColor="rgb(var(--chart-ochre))" />
          <StatCard accent="analytics" label="Active students" value={String(stats.activeStudents)} />
          <StatCard accent="session" label="Avg telemetry accuracy" value={`${stats.avgTelemetryAccuracy}%`} sparkData={studentFormTrends} sparkColor="rgb(var(--chart-petrol))" />
          <StatCard accent="replay" label="Replay clips saved" value={String(stats.replayClipsSaved)} />
        </div>
      )}

      {/* Charts + live rail */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        <div className="space-y-5 min-w-0">
          {/* Sessions chart */}
          <div className="bg-panel border border-hairline rounded-md p-5">
            <div className="flex justify-between items-center mb-3.5">
              <h2 className="font-display text-display-s">Sessions over time</h2>
              <span className="font-mono text-[0.6875rem] text-ink-faint">sessions / week</span>
            </div>
            <div className="bg-panel-2 rounded-sm p-4 min-h-32 flex items-center">
              {loading ? (
                <div className="w-full h-24 animate-shimmer rounded bg-[length:200%_100%] bg-gradient-to-r from-panel-2 via-panel to-panel-2" />
              ) : (
                <ChartOrEmpty data={sessionsOverTime.filter((v) => v > 0)}>
                  <WeeklyBarChart data={sessionsOverTime} color="rgb(var(--chart-ochre))" />
                </ChartOrEmpty>
              )}
            </div>
          </div>

          {/* Form trends */}
          <div className="bg-panel border border-hairline rounded-md p-5">
            <div className="flex justify-between items-center mb-3.5">
              <h2 className="font-display text-display-s">Student form trends</h2>
              <span className="font-mono text-[0.6875rem] text-ink-faint">avg pose confidence %</span>
            </div>
            <div className="bg-panel-2 rounded-sm p-4 min-h-32 flex items-center">
              {loading ? (
                <div className="w-full h-24 animate-shimmer rounded bg-[length:200%_100%] bg-gradient-to-r from-panel-2 via-panel to-panel-2" />
              ) : (
                <ChartOrEmpty data={studentFormTrends.filter((v) => v > 0)}>
                  <WeeklyBarChart data={studentFormTrends} color="rgb(var(--chart-petrol))" />
                </ChartOrEmpty>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5 min-w-0">
          {/* Live & upcoming */}
          <div className="bg-panel border border-hairline rounded-md p-5">
            <h2 className="font-display text-display-s mb-3.5">Live &amp; upcoming</h2>
            {liveSessions.length === 0 ? (
              <StateBlock icon={<CalendarDays className="w-full h-full" />} title="No live sessions right now" body="Sessions you start or that are scheduled soon will show up here." />
            ) : (
              <div className="flex flex-col gap-2.5">
                {liveSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2.5 bg-success/5 border border-success/20 rounded-sm px-3 py-2.5">
                    <div>
                      <Pill variant="success" pulse>{s.status}</Pill>
                      <div className="text-sm font-medium text-ink mt-1">{s.title}</div>
                    </div>
                    <Button href={`/session/${s.id}`} size="sm" variant="session">Join</Button>
                  </div>
                ))}
              </div>
            )}
            <Button variant="ghost" className="mt-3.5 w-full">Start instant room</Button>
          </div>

          {/* Recent clips */}
          <div className="bg-panel border border-hairline rounded-md p-5">
            <h2 className="font-display text-display-s mb-3.5">Recent clips</h2>
            {recentClips.length === 0 ? (
              <StateBlock icon={<Film className="w-full h-full" />} title="No clips yet" body="Save a replay from a live room to see it here." />
            ) : (
              <div className="flex flex-col gap-3">
                {recentClips.map((c) => (
                  <a key={c.id} href="/coach/clips" className="flex gap-2.5 items-center text-ink hover:text-ink-muted transition-colors">
                    <div className="w-16 h-11 rounded-sm bg-panel-2 border border-hairline flex-shrink-0 relative overflow-hidden">
                      <div className="absolute left-0 right-0 bottom-0.5 h-0.5 bg-replay/30" />
                      <div className="absolute left-[40%] bottom-0 w-0.5 h-1.5 bg-replay" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{c.title}</div>
                      <div className="font-mono text-xs text-replay">{c.timecode}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compares the last two non-empty weekly buckets — the only delta we can
 * honestly compute without a full separate prior-period query. Returns null
 * (no arrow shown) when there isn't enough real data yet. */
function computeWeekDelta(series?: number[]): { positive: boolean; label: string } | null {
  if (!series || series.length < 2) return null;
  const last = series[series.length - 1]!;
  const prev = series[series.length - 2]!;
  if (prev === 0) return null;
  const pct = Math.round(((last - prev) / prev) * 100);
  if (pct === 0) return null;
  return { positive: pct > 0, label: `${pct > 0 ? '+' : ''}${pct}%` };
}

function StatCard({
  accent,
  label,
  value,
  sparkData,
  sparkColor,
}: {
  accent: 'brand' | 'session' | 'analytics' | 'replay';
  label: string;
  value: string;
  sparkData?: number[];
  sparkColor?: string;
}) {
  const delta = computeWeekDelta(sparkData);
  return (
    <Card accent={accent}>
      <div className="text-xs text-ink-muted mb-2 pl-2">{label}</div>
      <div className="flex items-end justify-between gap-2.5 pl-2">
        <div className="font-mono font-medium text-lg text-ink">{value}</div>
        {sparkData && sparkData.some((v) => v > 0) && <Sparkline data={sparkData} color={sparkColor} />}
      </div>
      {delta && (
        <div className={`flex items-center gap-1.5 mt-2 pl-2 font-mono text-xs ${delta.positive ? 'text-success' : 'text-danger'}`}>
          {delta.positive ? '▲' : '▼'} {delta.label} <span className="text-ink-faint font-sans">vs prior week</span>
        </div>
      )}
    </Card>
  );
}

function WeeklyBarChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="w-full flex items-end justify-between gap-1.5 h-24">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={String(v)}>
          <div
            className="w-full rounded-sm transition-all"
            style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: color }}
          />
        </div>
      ))}
    </div>
  );
}
