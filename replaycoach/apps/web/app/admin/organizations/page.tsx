'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Building2 } from 'lucide-react';
import type { OrganizationSummaryDto, OrgStatus } from '@replaycoach/types';
import { orgClient } from '../../../lib/org-client';
import { Card } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { Input } from '../../components/ui/Input';
import { SkeletonRows, ErrorBlock, StateBlock } from '../../components/ui/StateBlocks';

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<OrganizationSummaryDto[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrgStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrgs(await orgClient.listAllOrganizations());
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load organizations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return orgs.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (search.trim() && !o.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [orgs, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-m text-ink">Organizations</h1>
        <p className="text-sm text-ink-muted mt-1">{orgs.length} total across the platform.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-full sm:w-64">
          <div className="relative">
            <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
            <Input id="org-search" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrgStatus | '')}
          className="bg-panel-2 border border-hairline rounded-sm px-3 py-2.5 text-sm text-ink"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : loading ? (
        <SkeletonRows count={6} />
      ) : filtered.length === 0 ? (
        <StateBlock icon={<Building2 />} title="No organizations found" body="Try a different search or filter." />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((org) => (
            <Link key={org.id} href={`/admin/organizations/${org.id}`}>
              <Card className="flex items-center gap-4 py-3.5 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className="w-10 h-10 rounded-md bg-analytics/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-analytics" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink truncate">{org.name}</div>
                  <div className="text-xs text-ink-faint">{org.coachCount} coaches · {org.studentCount} students</div>
                </div>
                <Pill variant={org.status === 'active' ? 'success' : 'danger'}>{org.status}</Pill>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
