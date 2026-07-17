'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Monitor, X as XIcon } from 'lucide-react';
import type { TotpEnrollResponse, UserSessionDto } from '@replaycoach/types';
import { userClient } from '../../../lib/user-client';
import { useAuthStore } from '../../../stores/auth-store';
import { toast } from '../../../stores/toast-store';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SkeletonRows, ErrorBlock } from '../../components/ui/StateBlocks';

export default function AdminSecurityPage() {
  const { user, updateUser } = useAuthStore();
  const [sessions, setSessions] = useState<UserSessionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setSessions(await userClient.listUserSessions(user.id));
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load your sessions.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRevoke = async (tokenId: string) => {
    if (!user) return;
    try {
      await userClient.revokeUserSession(user.id, tokenId);
      setSessions((prev) => prev.filter((s) => s.id !== tokenId));
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not revoke session.');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-display-m text-ink">Security</h1>
        <p className="text-sm text-ink-muted mt-1">Your own admin account's security controls.</p>
      </div>

      <Card>
        <h2 className="font-display text-display-s text-ink mb-1.5">Two-factor authentication</h2>
        <p className="text-sm text-ink-muted mb-4">
          Optional, extra protection for your admin account using an authenticator app.
        </p>
        {user && <TotpSection totpEnabled={user.totpEnabled} onChange={(enabled) => updateUser({ ...user, totpEnabled: enabled })} />}
      </Card>

      <Card>
        <h2 className="font-display text-display-s text-ink mb-1.5">Recent login</h2>
        <p className="text-sm text-ink-muted">
          {user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'No previous login recorded.'}
          {user?.lastLoginIp && ` from ${user.lastLoginIp}`}
        </p>
      </Card>

      <Card>
        <h2 className="font-display text-display-s text-ink mb-4">Your active sessions</h2>
        {error ? (
          <ErrorBlock message={error} onRetry={load} />
        ) : loading ? (
          <SkeletonRows count={2} />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-ink-faint">No active sessions.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-sm bg-panel-2 border border-hairline">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Monitor className="w-4 h-4 text-ink-faint flex-shrink-0" />
                  <div className="text-xs text-ink-faint font-mono">Signed in {new Date(s.createdAt).toLocaleString()}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(s.id)}
                  aria-label="Revoke session"
                  className="text-ink-faint hover:text-danger transition-colors flex-shrink-0"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TotpSection({ totpEnabled, onChange }: { totpEnabled: boolean; onChange: (enabled: boolean) => void }) {
  const [enrollment, setEnrollment] = useState<TotpEnrollResponse | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);

  const startEnroll = async () => {
    setLoading(true);
    setError(null);
    try {
      setEnrollment(await userClient.enrollTotp());
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not start enrollment.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await userClient.confirmTotp(code);
      setEnrollment(null);
      setCode('');
      onChange(true);
      toast.success('Two-factor authentication enabled.');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Incorrect code.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await userClient.disableTotp(password);
      setDisabling(false);
      setPassword('');
      onChange(false);
      toast.success('Two-factor authentication disabled.');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Incorrect password.');
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-3">
        <ErrorBlock message={error} />
        <Button variant="ghost" size="sm" onClick={() => setError(null)}>Try again</Button>
      </div>
    );
  }

  if (totpEnabled) {
    return disabling ? (
      <form onSubmit={handleDisable} className="flex flex-col gap-3 max-w-xs">
        <Input id="totp-disable-password" type="password" label="Confirm your password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setDisabling(false)}>Cancel</Button>
          <Button type="submit" variant="danger" size="sm" loading={loading} disabled={!password || loading}>Disable 2FA</Button>
        </div>
      </form>
    ) : (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-success text-sm">
          <ShieldCheck className="w-4 h-4" /> Enabled
        </div>
        <Button variant="ghost" size="sm" onClick={() => setDisabling(true)}>
          <ShieldOff className="w-3.5 h-3.5" /> Disable
        </Button>
      </div>
    );
  }

  if (enrollment) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs text-ink-muted mb-1.5">Enter this key manually in your authenticator app:</p>
          <code className="block bg-panel-2 border border-hairline rounded-sm px-3 py-2.5 text-sm font-mono text-ink break-all">
            {enrollment.secret}
          </code>
        </div>
        <div>
          <p className="text-xs text-ink-muted mb-1.5">Save these backup codes somewhere safe — each works once if you lose your device:</p>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-xs text-ink-muted">
            {enrollment.backupCodes.map((c) => <span key={c} className="bg-panel-2 border border-hairline rounded-sm px-2 py-1">{c}</span>)}
          </div>
        </div>
        <form onSubmit={handleConfirm} className="flex items-end gap-2 max-w-xs">
          <Input id="totp-confirm-code" label="6-digit code from your app" required maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          <Button type="submit" variant="analytics" loading={loading} disabled={code.length !== 6 || loading}>Confirm</Button>
        </form>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={startEnroll} loading={loading} disabled={loading}>
      <ShieldCheck className="w-3.5 h-3.5" /> Enable two-factor authentication
    </Button>
  );
}
