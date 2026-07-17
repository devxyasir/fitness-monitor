'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAdminElevateStore } from '../../stores/admin-elevate-store';
import { authClient } from '../../lib/auth-client';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { ErrorBlock } from '../components/ui/StateBlocks';

/** Mounted once at the admin layout root. Renders nothing until
 * useAdminElevateStore.requestElevation() is called from somewhere deep in
 * an admin page's error handling — see withAdminElevation. */
export function AdminElevateModal() {
  const { open, resolveOpen } = useAdminElevateStore();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const close = (confirmed: boolean) => {
    setPassword('');
    setError(null);
    setLoading(false);
    resolveOpen(confirmed);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authClient.elevateAdmin({ password });
      close(true);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Incorrect password');
      setLoading(false);
    }
  };

  return (
    <Modal title="Confirm it's you" onClose={() => close(false)} maxWidth="max-w-sm">
      <div className="flex items-start gap-3 mb-5">
        <ShieldAlert className="w-5 h-5 text-analytics flex-shrink-0 mt-0.5" />
        <p className="text-sm text-ink-muted leading-relaxed">
          Your admin session has gone stale for security. Re-enter your password to continue.
        </p>
      </div>
      {error && <div className="mb-4"><ErrorBlock message={error} /></div>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="elevate-password"
          type="password"
          label="Password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={() => close(false)} className="flex-1">Cancel</Button>
          <Button type="submit" variant="analytics" disabled={!password || loading} loading={loading} className="flex-1">
            Confirm
          </Button>
        </div>
      </form>
    </Modal>
  );
}
