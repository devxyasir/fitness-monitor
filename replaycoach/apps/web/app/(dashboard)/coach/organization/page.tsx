'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, Copy, X as XIcon, RefreshCw, Users, Mail, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import type { OrgInviteDto, SendOrgMessageResult, UserDto } from '@replaycoach/types';
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

/** Gmail/Outlook/Yahoo only — mirrors the server-side allowlist
 * (allowed-email-provider.validator.ts) so invalid domains get caught
 * before the round trip, not just after a 400. */
const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com'];
function isAllowedEmailProvider(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain);
}

export default function OrganizationPage() {
  const { user } = useAuthStore();
  const orgId = user?.orgId;
  const isOrgAdmin = user?.role === 'studio_admin' || user?.role === 'platform_admin';

  const [tab, setTab] = useState<'members' | 'invites'>(isOrgAdmin ? 'members' : 'invites');
  const [members, setMembers] = useState<UserDto[]>([]);
  const [invites, setInvites] = useState<OrgInviteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [composer, setComposer] = useState<{ recipientIds?: string[] } | null>(null);

  // Org admins can message anyone in the org; a plain coach only students —
  // mirrors OrganizationService.sendMessage's server-side rule so the
  // picker never even offers someone the send will 403 on.
  const messageableMembers = useMemo(
    () => (isOrgAdmin ? members.filter((m) => m.id !== user?.id) : members.filter((m) => m.role === 'student')),
    [members, isOrgAdmin, user?.id],
  );

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
          <p className="text-ink-muted text-sm mt-1">
            {isOrgAdmin ? "Manage who's part of your organization and pending invites." : 'Invite your students and track who has joined.'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {messageableMembers.length > 0 && (
            <Button variant="ghost" onClick={() => setComposer({})}>
              <Send className="w-4 h-4" /> Message {isOrgAdmin ? 'members' : 'students'}
            </Button>
          )}
          <Button onClick={() => setInviteModalOpen(true)}>
            <UserPlus className="w-4 h-4" /> {isOrgAdmin ? 'Invite someone' : 'Invite a student'}
          </Button>
        </div>
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
                    {messageableMembers.some((mm) => mm.id === m.id) && (
                      <button
                        type="button"
                        onClick={() => setComposer({ recipientIds: [m.id] })}
                        aria-label={`Message ${m.displayName}`}
                        title="Send a message"
                        className="text-ink-faint hover:text-ink transition-colors"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    {isOrgAdmin && m.id !== user?.id && (
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
          canInviteCoaches={isOrgAdmin}
          onClose={() => setInviteModalOpen(false)}
          onCreated={() => {
            setInviteModalOpen(false);
            setTab('invites');
            load();
          }}
        />
      )}

      {composer && orgId && (
        <EmailComposerModal
          orgId={orgId}
          recipients={messageableMembers}
          {...(composer.recipientIds ? { initialRecipientIds: composer.recipientIds } : {})}
          isOrgAdmin={isOrgAdmin}
          onClose={() => setComposer(null)}
        />
      )}
    </div>
  );
}

function InviteModal({
  orgId,
  canInviteCoaches,
  onClose,
  onCreated,
}: {
  orgId: string;
  canInviteCoaches: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  // A plain coach can only ever invite students — no picker needed, the
  // choice doesn't exist for them (matches the server-side rule).
  const [role, setRole] = useState<'coach' | 'student'>('student');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = email.trim().length > 0 && isAllowedEmailProvider(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { inviteToken } = await orgClient.createInvite(orgId, { email, role: canInviteCoaches ? role : 'student' });
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
    <Modal title={canInviteCoaches ? 'Invite someone' : 'Invite a student'} onClose={onClose}>
      <p className="text-ink-muted text-sm mb-5 leading-relaxed">
        We'll email them an invite link right away. It's also copied to your clipboard in case you'd rather send it yourself.
      </p>
      {error && <div className="mb-4"><ErrorBlock message={error} /></div>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Input
            id="invite-email"
            type="email"
            label="Their email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="dancer@gmail.com"
          />
          <p className="text-xs text-ink-faint mt-1.5">Gmail, Outlook, or Yahoo addresses only.</p>
        </div>
        {canInviteCoaches && (
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
        )}
        <div className="flex gap-3 mt-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" disabled={!emailValid || loading} loading={loading} className="flex-1">
            <Copy className="w-4 h-4" /> {loading ? 'Creating…' : 'Create & copy link'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EmailComposerModal({
  orgId,
  recipients,
  initialRecipientIds,
  isOrgAdmin,
  onClose,
}: {
  orgId: string;
  recipients: UserDto[];
  initialRecipientIds?: string[];
  isOrgAdmin: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialRecipientIds ?? []));
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendOrgMessageResult | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = recipients.length > 0 && selected.size === recipients.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(recipients.map((r) => r.id)));

  const canSend = selected.size > 0 && subject.trim().length > 0 && message.trim().length > 0 && !sending;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const res = await orgClient.sendMessage(orgId, {
        recipientIds: Array.from(selected),
        subject: subject.trim(),
        message: message.trim(),
      });
      setResult(res);
      if (res.failed.length === 0) {
        toast.success(res.sent === 1 ? 'Message sent.' : `Message sent to ${res.sent} people.`);
      }
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not send the message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal title={isOrgAdmin ? 'Message members' : 'Message students'} onClose={onClose} maxWidth="max-w-lg">
      {result ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 p-4 rounded-sm bg-panel-2 border border-hairline">
            {result.failed.length === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-chart-ochre flex-shrink-0 mt-0.5" />
            )}
            <div className="text-sm text-ink">
              {result.sent > 0 && <p>Sent to {result.sent} {result.sent === 1 ? 'person' : 'people'}.</p>}
              {result.failed.length > 0 && <p className="text-ink-muted mt-1">{result.failed.length} could not be delivered.</p>}
            </div>
          </div>
          {result.failed.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {result.failed.map((f: SendOrgMessageResult['failed'][number]) => {
                const recipient = recipients.find((r) => r.id === f.userId);
                return (
                  <div key={f.userId} className="text-xs text-ink-faint flex justify-between gap-3">
                    <span className="truncate">{recipient?.displayName ?? f.userId}</span>
                    <span className="text-danger flex-shrink-0">{f.reason}</span>
                  </div>
                );
              })}
            </div>
          )}
          <Button type="button" onClick={onClose} className="w-full">Done</Button>
        </div>
      ) : (
        <form onSubmit={handleSend} className="flex flex-col gap-4">
          {error && <ErrorBlock message={error} />}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-label text-ink-muted">
                Recipients {selected.size > 0 && `(${selected.size} selected)`}
              </label>
              <button type="button" onClick={toggleAll} className="text-xs text-brand hover:underline">
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1 border border-hairline rounded-sm p-2 bg-panel-2">
              {recipients.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-sm hover:bg-panel cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="accent-brand"
                  />
                  <span className="text-sm text-ink truncate">{r.displayName}</span>
                  <span className="text-xs text-ink-faint truncate ml-auto">{r.email}</span>
                </label>
              ))}
            </div>
          </div>

          <Input
            id="message-subject"
            label="Subject"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="This week's schedule update"
            maxLength={200}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="message-body" className="text-label text-ink-muted">Message</label>
            <textarea
              id="message-body"
              required
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your message…"
              maxLength={10000}
              className="w-full bg-panel-2 border border-hairline rounded-sm px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-all duration-150 focus:outline-none focus-visible:border-brand focus-visible:shadow-focus resize-y"
            />
          </div>

          <div className="flex gap-3 mt-2">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={!canSend} loading={sending} className="flex-1">
              <Send className="w-4 h-4" /> {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
