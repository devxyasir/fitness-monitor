'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Copy, X as XIcon, RefreshCw, Users, Mail } from 'lucide-react';
import type { OrgInviteDto, UserDto } from '@replaycoach/types';
import { orgClient } from '../../../../lib/org-client';
import { useAuthStore } from '../../../../stores/auth-store';
import { toast } from '../../../../stores/toast-store';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Card } from '../../../components/ui/Card';
import { Pill } from '../../../components/ui/Pill';
import { Tabs } from '../../../components/ui/Tabs';
import { Modal } from '../../../components/ui/Modal';
import { SkeletonRows, StateBlock, ErrorBlock } from '../../../components/ui/StateBlocks';

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return days === 1 ? '1 day left' : `${days} days left`;
}

export default function OrganizationPage() {
  const { user } = useAuthStore();
  const orgId = user?.orgId;

  const [tab, setTab] = useState<'members' | 'invites'>('members');
  const [members, setMembers] = useState<UserDto[]>([]);
  const [invites, setInvites] = useState<OrgInviteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [m, i] = await Promise.all([orgClient.listMembers(orgId), orgClient.listInvites(orgId)]);
      setMembers(m);
      setInvites(i.filter((inv) => !inv.usedAt));
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load your organization.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRevoke = async (inviteId: string) => {
    if (!orgId) return;
    try {
      await orgClient.revokeInvite(orgId, inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success('Invite revoked.');
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not revoke invite.');
    }
  };

  const handleResend = async (inviteId: string) => {
    if (!orgId) return;
    try {
      const { inviteToken } = await orgClient.resendInvite(orgId, inviteId);
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${inviteToken}`);
      toast.success('New invite link copied to clipboard.');
      load();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not resend invite.');
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!orgId) return;
    if (!window.confirm(`Remove ${name} from your organization?`)) return;
    try {
      await orgClient.removeMember(orgId, userId);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
      toast.success(`${name} removed.`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not remove member.');
    }
  };

  if (!orgId) return null; // AuthInitializer routes org-less coaches to onboarding first.

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h2 className="font-display text-display-m text-ink">Organization</h2>
          <p className="text-ink-muted text-sm mt-1">Manage who's part of your organization and pending invites.</p>
        </div>
        <Button onClick={() => setInviteModalOpen(true)}>
          <UserPlus className="w-4 h-4" /> Invite someone
        </Button>
      </div>

      <Tabs
        items={[
          { key: 'members', label: `Members (${members.length})` },
          { key: 'invites', label: `Pending invites (${invites.length})` },
        ]}
        active={tab}
        onChange={(k) => setTab(k as 'members' | 'invites')}
      />

      <div className="mt-5">
        {loading ? (
          <SkeletonRows count={4} />
        ) : error ? (
          <ErrorBlock message={error} onRetry={load} />
        ) : tab === 'members' ? (
          members.length === 0 ? (
            <StateBlock icon={<Users />} title="No members yet" body="Invite your first coach or student to get started." />
          ) : (
            <div className="flex flex-col gap-2">
              {members.map((m) => (
                <Card key={m.id} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{m.displayName}</div>
                    <div className="text-xs text-ink-faint truncate">{m.email}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Pill variant={m.role === 'student' ? 'scheduled' : 'success'}>{m.role.replace('_', ' ')}</Pill>
                    {m.id !== user?.id && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.id, m.displayName)}
                        aria-label={`Remove ${m.displayName}`}
                        className="text-ink-faint hover:text-danger transition-colors"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : invites.length === 0 ? (
          <StateBlock icon={<Mail />} title="No pending invites" body="Everyone you've invited has already joined, or you haven't invited anyone yet." />
        ) : (
          <div className="flex flex-col gap-2">
            {invites.map((inv) => (
              <Card key={inv.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">{inv.invitedEmail}</div>
                  <div className="text-xs text-ink-faint">{timeUntil(inv.expiresAt)}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Pill variant={inv.role === 'student' ? 'scheduled' : 'success'}>{inv.role}</Pill>
                  <button
                    type="button"
                    onClick={() => handleResend(inv.id)}
                    aria-label="Resend invite"
                    title="Generate a new link"
                    className="text-ink-faint hover:text-ink transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevoke(inv.id)}
                    aria-label="Revoke invite"
                    className="text-ink-faint hover:text-danger transition-colors"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {inviteModalOpen && orgId && (
        <InviteModal
          orgId={orgId}
          onClose={() => setInviteModalOpen(false)}
          onCreated={() => {
            setInviteModalOpen(false);
            setTab('invites');
            load();
          }}
        />
      )}
    </div>
  );
}

function InviteModal({ orgId, onClose, onCreated }: { orgId: string; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'coach' | 'student'>('student');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { inviteToken } = await orgClient.createInvite(orgId, { email, role });
      const link = `${window.location.origin}/invite/${inviteToken}`;
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied to clipboard — send it to them directly.');
      onCreated();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not create invite.');
      setLoading(false);
    }
  };

  return (
    <Modal title="Invite someone" onClose={onClose}>
      <p className="text-ink-muted text-sm mb-5 leading-relaxed">
        There's no email delivery yet — you'll get a link to copy and send yourself (text, WhatsApp, email, however you reach them).
      </p>
      {error && <div className="mb-4"><ErrorBlock message={error} /></div>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="invite-email"
          type="email"
          label="Their email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="athlete@example.com"
        />
        <div>
          <label className="block text-label text-ink-muted mb-1.5">Role</label>
          <div className="flex gap-2">
            {(['student', 'coach'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex-1 px-3.5 py-2.5 rounded-sm text-sm border transition-colors ${
                  role === r ? 'bg-brand/10 border-brand text-brand font-medium' : 'bg-panel-2 border-hairline text-ink-muted hover:text-ink'
                }`}
              >
                {r === 'student' ? 'Student' : 'Coach'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 mt-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" disabled={!email.trim() || loading} loading={loading} className="flex-1">
            <Copy className="w-4 h-4" /> {loading ? 'Creating…' : 'Create & copy link'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
