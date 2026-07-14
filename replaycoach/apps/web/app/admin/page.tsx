'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { Shield, Users, Activity, Calendar } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { SkeletonRows, ErrorBlock } from '../components/ui/StateBlocks';

interface PlatformStats {
  totalUsers: number;
  totalSessions: number;
  totalOrgs: number;
  activeSessions: number;
}

export default function AdminPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const users = await apiClient.get<any[]>('/users');
      // TODO: totalSessions/totalOrgs/activeSessions are not wired to real
      // endpoints yet — out of scope for the presentation-layer redesign,
      // see design/pages/admin.md. Only totalUsers is real.
      setStats({
        totalUsers: users.length,
        totalSessions: 0,
        totalOrgs: 0,
        activeSessions: 0,
      });
      setError(null);
    } catch (err: any) {
      setError('Failed to load platform stats.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-display font-semibold text-ink">Platform admin</h1>
        <p className="text-sm text-ink-muted mt-1">Overview and management</p>
      </div>

      {error && <ErrorBlock message={error} onRetry={fetchStats} />}

      {loading ? (
        <SkeletonRows count={2} />
      ) : stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminStatCard icon={Users} label="Total users" value={stats.totalUsers} />
          <AdminStatCard icon={Calendar} label="Total sessions" value={stats.totalSessions} />
          <AdminStatCard icon={Shield} label="Organizations" value={stats.totalOrgs} />
          <AdminStatCard icon={Activity} label="Active sessions" value={stats.activeSessions} />
        </div>
      )}

      <div className="bg-panel border border-hairline rounded-md p-6">
        <h2 className="font-display text-display-s text-ink mb-4">Quick actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AdminActionLink label="Manage users" icon={Users} href="/admin/users" />
          <AdminActionLink label="Manage organizations" icon={Shield} href="/admin/orgs" />
        </div>
      </div>
    </div>
  );
}

function AdminStatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
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

function AdminActionLink({ label, icon: Icon, href }: { label: string; icon: typeof Users; href: string }) {
  return (
    <a href={href} className="flex items-center gap-3 p-4 rounded-sm bg-panel-2 hover:bg-panel-2/70 transition-colors border border-hairline">
      <Icon className="w-5 h-5 text-ink-muted" />
      <span className="text-sm font-medium text-ink">{label}</span>
    </a>
  );
}
