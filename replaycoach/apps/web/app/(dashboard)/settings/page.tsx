'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../stores/auth-store';
import { userClient } from '../../../lib/user-client';
import { authClient } from '../../../lib/auth-client';
import { toast } from '../../../stores/toast-store';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ErrorBlock } from '../../components/ui/StateBlocks';

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One digit', test: (p: string) => /\d/.test(p) },
];

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore();

  return (
    <div className="max-w-xl">
      <h2 className="font-display text-display-m text-ink mb-1">Settings</h2>
      <p className="text-ink-muted text-sm mb-8">Manage your profile and account security.</p>

      <div className="flex flex-col gap-6">
        <ProfileCard displayName={user?.displayName ?? ''} email={user?.email ?? ''} onUpdated={updateUser} />
        <PasswordCard />
        <AccountCard role={user?.role} />
      </div>
    </div>
  );
}

function ProfileCard({
  displayName: initialName,
  email,
  onUpdated,
}: {
  displayName: string;
  email: string;
  onUpdated: (user: import('@replaycoach/types').UserDto) => void;
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const updated = await userClient.updateProfile({ displayName });
      onUpdated(updated);
      toast.success('Profile updated.');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not update profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <h3 className="font-display text-display-s text-ink mb-4">Profile</h3>
      {error && <div className="mb-4"><ErrorBlock message={error} /></div>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="settings-name"
          type="text"
          label="Full name"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <div>
          <label className="block text-label text-ink-muted mb-1.5">Email</label>
          <div className="w-full bg-panel-2 border border-hairline rounded-sm px-3.5 py-2.5 text-sm text-ink-faint">
            {email}
          </div>
        </div>
        <Button
          type="submit"
          disabled={!displayName.trim() || displayName === initialName || loading}
          loading={loading}
          className="self-start"
        >
          {loading ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordValid = PASSWORD_RULES.every((r) => r.test(newPassword));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await userClient.changePassword(currentPassword, newPassword);
      toast.success('Password changed. Please log in again.');
      // Changing password bumps sessionVersion server-side, invalidating
      // every issued token including this one — send the user to log back
      // in rather than let the next request surprise-401 them.
      await authClient.logout().catch(() => {});
      router.push('/login');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not change password.');
      setLoading(false);
    }
  };

  return (
    <Card>
      <h3 className="font-display text-display-s text-ink mb-4">Change password</h3>
      {error && <div className="mb-4"><ErrorBlock message={error} /></div>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="settings-current-password"
          type="password"
          label="Current password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <div>
          <Input
            id="settings-new-password"
            type="password"
            label="New password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onFocus={() => setPasswordTouched(true)}
          />
          {passwordTouched && (
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 animate-rise">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(newPassword);
                return (
                  <li key={rule.label} className={`text-[11px] flex items-center gap-1.5 ${met ? 'text-success' : 'text-ink-faint'}`}>
                    <span className={`w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0 ${met ? 'bg-success/20' : 'bg-panel-2 border border-hairline'}`}>
                      {met && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                          <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Button
          type="submit"
          disabled={!currentPassword || !passwordValid || loading}
          loading={loading}
          className="self-start"
        >
          {loading ? 'Changing…' : 'Change password'}
        </Button>
      </form>
    </Card>
  );
}

function AccountCard({ role }: { role?: string | undefined }) {
  const roleLabel = role === 'studio_admin' ? 'Organization admin' : role === 'platform_admin' ? 'Platform admin' : role === 'coach' ? 'Coach' : 'Student';
  return (
    <Card>
      <h3 className="font-display text-display-s text-ink mb-4">Account</h3>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-muted">Role</span>
        <span className="text-ink font-medium">{roleLabel}</span>
      </div>
    </Card>
  );
}
