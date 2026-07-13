'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Sparkline } from '../../components/ui/Sparkline';
import { Pill } from '../../components/ui/Pill';

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

export default function CoachOverviewPage() {
  const [stats, setStats] = useState<CoachStats | null>(null);
  const [liveSessions, setLiveSessions] = useState<Session[]>([]);
  const [recentClips, setRecentClips] = useState<Clip[]>([]);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverview();
  }, [range]);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setStats({ sessionsHosted: 0, activeStudents: 0, avgTelemetryAccuracy: 0, replayClipsSaved: 0 });
      setLiveSessions([]);
      setRecentClips([]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex justify-end">
        <div className="flex gap-0.5 bg-panel border border-hairline rounded-full p-0.5">
          {(['7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`font-mono text-xs rounded-full px-3.5 py-1.5 transition-colors ${
                r === range ? 'bg-panel-2 text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Stat row */}
      {loading || !stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-panel border border-hairline rounded-lg p-5 h-24 animate-shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Sessions hosted" value={String(stats.sessionsHosted)} delta="+12%" deltaPositive sparkData={[4, 6, 5, 8, 7, 9, 11]} />
          <StatCard label="Active students" value={String(stats.activeStudents)} delta="+3" deltaPositive sparkData={[10, 11, 12, 12, 14]} />
          <StatCard label="Avg telemetry accuracy" value={`${stats.avgTelemetryAccuracy}%`} delta="+2pts" deltaPositive sparkData={[85, 87, 88, 89, 91]} />
          <StatCard label="Replay clips saved" value={String(stats.replayClipsSaved)} delta="+18%" deltaPositive sparkData={[40, 45, 50, 55, 63]} />
        </div>
      )}

      {/* Charts + live rail */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        <div className="space-y-5 min-w-0">
          {/* Sessions chart */}
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <div className="flex justify-between items-center mb-3.5">
              <h2 className="font-display font-semibold text-[1.0625rem]">Sessions over time</h2>
              <span className="font-mono text-[0.6875rem] text-ink-faint">sessions / week</span>
            </div>
            <div className="bg-panel-2 rounded-md p-4 flex items-center justify-center min-h-32">
              <span className="text-ink-faint text-sm">Chart data loading...</span>
            </div>
          </div>

          {/* Form trends */}
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <div className="flex justify-between items-center mb-3.5">
              <h2 className="font-display font-semibold text-[1.0625rem]">Student form trends</h2>
              <span className="font-mono text-[0.6875rem] text-ink-faint">shoulder angle accuracy %</span>
            </div>
            <div className="bg-panel-2 rounded-md p-4 flex items-center justify-center min-h-32">
              <span className="text-ink-faint text-sm">Chart data loading...</span>
            </div>
          </div>
        </div>

        <div className="space-y-5 min-w-0">
          {/* Live & upcoming */}
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <h2 className="font-display font-semibold text-base mb-3.5">Live &amp; upcoming</h2>
            <div className="flex flex-col gap-2.5">
              {liveSessions.length === 0 ? (
                <p className="text-ink-muted text-sm text-center py-6">No live sessions right now</p>
              ) : (
                liveSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2.5 bg-live/5 border border-live/20 rounded-lg px-3 py-2.5">
                    <div>
                      <Pill variant="live" pulse>{s.status}</Pill>
                      <div className="text-sm font-medium mt-1">{s.title}</div>
                    </div>
                    <Link href={`/session/${s.id}`} className="text-xs font-semibold text-canvas bg-live rounded-full px-3 py-1.5">
                      Join
                    </Link>
                  </div>
                ))
              )}
            </div>
            <button className="mt-3.5 w-full font-semibold text-sm text-ink bg-panel-2 border border-hairline rounded-full py-2.5 hover:bg-panel-2/80 transition-colors">
              Start instant room
            </button>
          </div>

          {/* Recent clips */}
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <h2 className="font-display font-semibold text-base mb-3.5">Recent clips</h2>
            <div className="flex flex-col gap-3">
              {recentClips.length === 0 ? (
                <p className="text-ink-muted text-sm text-center py-4">No clips yet — save a replay from a live room</p>
              ) : (
                recentClips.map((c) => (
                  <Link key={c.id} href="/coach/clips" className="flex gap-2.5 items-center text-ink hover:text-ink-muted transition-colors">
                    <div className="w-16 h-11 rounded-md bg-panel-2 border border-hairline flex-shrink-0 relative overflow-hidden">
                      <div className="absolute left-0 right-0 bottom-0.5 h-0.5 bg-replay/30" />
                      <div className="absolute left-[40%] bottom-0 w-0.5 h-1.5 bg-replay" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{c.title}</div>
                      <div className="font-mono text-xs text-replay">{c.timecode}</div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, delta, deltaPositive, sparkData }: { label: string; value: string; delta: string; deltaPositive: boolean; sparkData: number[] }) {
  return (
    <div className="bg-panel border border-hairline rounded-lg p-5">
      <div className="text-xs text-ink-muted mb-2">{label}</div>
      <div className="flex items-end justify-between gap-2.5">
        <div className="font-mono font-medium text-lg">{value}</div>
        <Sparkline data={sparkData} />
      </div>
      <div className={`flex items-center gap-1.5 mt-2 font-mono text-xs ${deltaPositive ? 'text-live' : 'text-danger'}`}>
        {deltaPositive ? '▲' : '▼'} {delta} <span className="text-ink-faint font-sans">vs prior period</span>
      </div>
    </div>
  );
}
