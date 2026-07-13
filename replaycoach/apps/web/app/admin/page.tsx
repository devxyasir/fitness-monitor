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
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        <span className="ml-2 text-slate-400">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Platform Admin</h1>
        <p className="text-sm text-slate-400 mt-1">Overview and management</p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-950/30 border border-red-800 text-red-300 text-sm">
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

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center">
          <Icon className="w-5 h-5 text-indigo-300" />
        </div>
        <div>
          <div className="text-2xl font-bold text-white">{value}</div>
          <div className="text-xs text-slate-400">{label}</div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, icon: Icon, href }: { label: string; icon: any; href: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 p-4 rounded-lg bg-slate-800 hover:bg-slate-700 transition border border-slate-700"
    >
      <Icon className="w-5 h-5 text-slate-400" />
      <span className="text-sm font-medium text-white">{label}</span>
    </a>
  );
}
