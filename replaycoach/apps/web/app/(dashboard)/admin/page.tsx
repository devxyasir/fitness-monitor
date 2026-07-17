'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import type { OrganizationSummaryDto, UserDto } from '@replaycoach/types';
import { orgClient } from '../../../lib/org-client';
import { Card } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { SkeletonRows, StateBlock, ErrorBlock } from '../../components/ui/StateBlocks';

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<OrganizationSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setOrgs(await orgClient.listAllOrganizations());
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load organizations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-3xl">
      <h2 className="font-display text-display-m text-ink mb-1">All organizations</h2>
      <p className="text-ink-muted text-sm mb-6">Every organization on this deployment, with its coaches and students.</p>

      {loading ? (
        <SkeletonRows count={4} />
      ) : error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : orgs.length === 0 ? (
        <StateBlock icon={<Building2 />} title="No organizations yet" body="Organizations appear here once a coach signs up and creates one." />
      ) : (
        <div className="flex flex-col gap-3">
          {orgs.map((org) => (
            <OrgRow key={org.id} org={org} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrgRow({ org }: { org: OrganizationSummaryDto }) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<UserDto[] | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const toggle = async () => {
    setExpanded((v) => !v);
    if (!members && !expanded) {
      setLoadingMembers(true);
      try {
        setMembers(await orgClient.listMembers(org.id));
      } catch {
        setMembers([]);
      } finally {
        setLoadingMembers(false);
      }
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left">
        <div className="flex items-center gap-3 min-w-0">
          {expanded ? <ChevronDown className="w-4 h-4 text-ink-faint flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-ink-faint flex-shrink-0" />}
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink truncate">{org.name}</div>
            <div className="text-xs text-ink-faint">Created {new Date(org.createdAt).toLocaleDateString()}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Pill variant="success">{org.coachCount} coach{org.coachCount === 1 ? '' : 'es'}</Pill>
          <Pill variant="scheduled">{org.studentCount} student{org.studentCount === 1 ? '' : 's'}</Pill>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-hairline px-6 py-4">
          {loadingMembers ? (
            <SkeletonRows count={2} />
          ) : !members || members.length === 0 ? (
            <p className="text-sm text-ink-faint">No members yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-4 py-1.5">
                  <div className="min-w-0">
                    <div className="text-sm text-ink truncate">{m.displayName}</div>
                    <div className="text-xs text-ink-faint truncate">{m.email}</div>
                  </div>
                  <Pill variant={m.role === 'student' ? 'scheduled' : 'success'}>{m.role.replace('_', ' ')}</Pill>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
