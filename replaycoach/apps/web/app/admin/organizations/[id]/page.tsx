'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Mail } from 'lucide-react';
import type { OrganizationDto, OrgInviteDto, UserDto } from '@replaycoach/types';
import { orgClient } from '../../../../lib/org-client';
import { withAdminElevation } from '../../../../stores/admin-elevate-store';
import { toast } from '../../../../stores/toast-store';
import { Avatar } from '../../../components/Avatar';
import { Card } from '../../../components/ui/Card';
import { Pill } from '../../../components/ui/Pill';
import { Button } from '../../../components/ui/Button';
import { SkeletonRows, ErrorBlock, StateBlock } from '../../../components/ui/StateBlocks';

export default function AdminOrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [org, setOrg] = useState<OrganizationDto | null>(null);
  const [members, setMembers] = useState<UserDto[]>([]);
  const [invites, setInvites] = useState<OrgInviteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, m, i] = await Promise.all([
        orgClient.getOrganization(params.id),
        orgClient.listMembers(params.id),
        orgClient.listInvites(params.id),
      ]);
      setOrg(o);
      setMembers(m);
      setInvites(i.filter((inv) => !inv.usedAt));
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load this organization.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleStatus = async () => {
    if (!org) return;
    const nextStatus = org.status === 'active' ? 'suspended' : 'active';
    if (!window.confirm(`${nextStatus === 'suspended' ? 'Suspend' : 'Reactivate'} ${org.name}?`)) return;
    setSaving(true);
    try {
      const updated = await withAdminElevation(() => orgClient.setOrgStatus(org.id, { status: nextStatus }));
      setOrg(updated);
      toast.success(`Organization ${nextStatus}.`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not update organization status.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!org) return;
    if (members.length > 0) {
      toast.error('Remove every member before deleting an organization.');
      return;
    }
    if (!window.confirm(`Permanently delete ${org.name}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await withAdminElevation(() => orgClient.deleteOrganization(org.id));
      toast.success('Organization deleted.');
      router.push('/admin/organizations');
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not delete organization.');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <button
        type="button"
        onClick={() => router.push('/admin/organizations')}
        className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to organizations
      </button>

      {error && <ErrorBlock message={error} onRetry={load} />}

      {loading ? (
        <SkeletonRows count={4} />
      ) : org && (
        <>
          <Card accent="analytics" className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-md bg-analytics/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-7 h-7 text-analytics" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-display-m text-ink truncate">{org.name}</h1>
              <p className="text-sm text-ink-muted">{members.length} members · plan: {org.planTier}</p>
            </div>
            <Pill variant={org.status === 'active' ? 'success' : 'danger'}>{org.status}</Pill>
          </Card>

          <Card>
            <h2 className="font-display text-display-s text-ink mb-4">Danger zone</h2>
            <div className="flex flex-wrap gap-3">
              <Button variant="ghost" size="sm" disabled={saving} onClick={handleToggleStatus}>
                {org.status === 'active' ? 'Suspend organization' : 'Reactivate organization'}
              </Button>
              <Button variant="danger" size="sm" disabled={saving} onClick={handleDelete}>
                Delete organization
              </Button>
            </div>
            {members.length > 0 && (
              <p className="text-xs text-ink-faint mt-2.5">Remove every member before an organization can be deleted.</p>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-display-s text-ink mb-4">Members ({members.length})</h2>
            {members.length === 0 ? (
              <p className="text-sm text-ink-faint">No members.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-sm bg-panel-2 border border-hairline">
                    <Avatar user={m} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink truncate">{m.displayName}</div>
                      <div className="text-xs text-ink-faint truncate">{m.email}</div>
                    </div>
                    <Pill variant={m.role === 'student' ? 'scheduled' : 'success'}>{m.role.replace('_', ' ')}</Pill>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-display-s text-ink mb-4">Pending invites ({invites.length})</h2>
            {invites.length === 0 ? (
              <StateBlock icon={<Mail />} title="No pending invites" body="Nobody is currently invited and unjoined." />
            ) : (
              <div className="flex flex-col gap-2">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 p-3 rounded-sm bg-panel-2 border border-hairline">
                    <span className="text-sm text-ink truncate">{inv.invitedEmail}</span>
                    <Pill variant={inv.role === 'student' ? 'scheduled' : 'success'}>{inv.role}</Pill>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
