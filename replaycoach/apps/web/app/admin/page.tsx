'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, Building2, Activity, UserPlus, Video } from 'lucide-react';
import type { AdminDashboardDto } from '@replaycoach/types';
import { adminClient } from '../../lib/admin-client';
import { Card } from '../components/ui/Card';
import { Sparkline } from '../components/ui/Sparkline';
import { SkeletonRows, ErrorBlock } from '../components/ui/StateBlocks';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await adminClient.getDashboard());
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load dashboard stats.');
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
        <h1 className="font-display text-display-m text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted mt-1">Platform-wide overview — every number here is live.</p>
      </div>

      {error && <ErrorBlock message={error} onRetry={load} />}

      {loading ? (
        <SkeletonRows count={2} />
      ) : stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Total users" value={stats.totalUsers} />
            <StatCard icon={Building2} label="Organizations" value={stats.totalOrganizations} />
            <StatCard icon={Activity} label="Live right now" value={stats.activeSessionsNow} />
            <StatCard icon={UserPlus} label="Signups this week" value={stats.signupsThisWeek} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card accent="analytics">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-display-s text-ink">Signups, last 14 days</h3>
                <Sparkline data={stats.signupsTrend} width={140} height={36} />
              </div>
              <p className="text-2xl font-mono font-bold text-ink">{stats.signupsThisWeek}</p>
              <p className="text-xs text-ink-muted">this week</p>
            </Card>
            <Card accent="analytics">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-display-s text-ink">Sessions, last 14 days</h3>
                <Sparkline data={stats.sessionsTrend} width={140} height={36} />
              </div>
              <p className="text-2xl font-mono font-bold text-ink">{stats.sessionsThisWeek}</p>
              <p className="text-xs text-ink-muted">this week</p>
            </Card>
          </div>

          <div className="bg-panel border border-hairline rounded-md p-6">
            <h2 className="font-display text-display-s text-ink mb-4">Quick actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <ActionLink label="Manage users" icon={Users} href="/admin/users" />
              <ActionLink label="Manage organizations" icon={Building2} href="/admin/organizations" />
              <ActionLink label="Monitor sessions" icon={Video} href="/admin/sessions" />
              <ActionLink label="View audit log" icon={Activity} href="/admin/audit" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <Card accent="analytics" className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-md bg-analytics/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-analytics" />
      </div>
      <div>
        <div className="text-xl font-mono font-bold text-ink">{value}</div>
        <div className="text-xs text-ink-muted">{label}</div>
      </div>
    </Card>
  );
}

function ActionLink({ label, icon: Icon, href }: { label: string; icon: typeof Users; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 p-4 rounded-sm bg-panel-2 hover:bg-panel-2/70 transition-colors border border-hairline">
      <Icon className="w-5 h-5 text-ink-muted" />
      <span className="text-sm font-medium text-ink">{label}</span>
    </Link>
  );
}
