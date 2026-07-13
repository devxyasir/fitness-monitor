'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { Shield, Users, Activity, Calendar, Loader2 } from 'lucide-react';

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-brand-indigo animate-spin" />
        <span className="ml-2 text-ink-muted">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Platform Admin</h1>
        <p className="text-sm text-ink-muted mt-1">Overview and management</p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
          {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total Users" value={stats.totalUsers} />
          <StatCard icon={Calendar} label="Total Sessions" value={stats.totalSessions} />
          <StatCard icon={Shield} label="Organizations" value={stats.totalOrgs} />
          <StatCard icon={Activity} label="Active Sessions" value={stats.activeSessions} />
        </div>
      )}

      <div className="bg-panel border border-hairline rounded-xl p-6">
        <h2 className="text-lg font-semibold text-ink mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ActionButton label="Manage Users" icon={Users} href="/admin/users" />
          <ActionButton label="Manage Organizations" icon={Shield} href="/admin/orgs" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="bg-panel border border-hairline rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-indigo/20 flex items-center justify-center">
          <Icon className="w-5 h-5 text-brand-indigo" />
        </div>
        <div>
          <div className="text-2xl font-bold text-ink">{value}</div>
          <div className="text-xs text-ink-muted">{label}</div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, icon: Icon, href }: { label: string; icon: any; href: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 p-4 rounded-lg bg-panel-2 hover:bg-panel-2/80 transition border border-hairline"
    >
      <Icon className="w-5 h-5 text-ink-muted" />
      <span className="text-sm font-medium text-ink">{label}</span>
    </a>
  );
}
