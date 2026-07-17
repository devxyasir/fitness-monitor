'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { authClient } from '../../../lib/auth-client';
import { useAuthStore } from '../../../stores/auth-store';
import { Logomark } from '../../components/Logomark';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ErrorBlock } from '../../components/ui/StateBlocks';

/**
 * Deliberately its own full page, not sharing (auth)/login's layout or
 * form — a coach/student typing /admin should land somewhere that visibly
 * reads as a different, more serious application, not a themed variant of
 * the normal login. Calls the same POST /auth/login as everyone else, but
 * with context: 'admin' — the server rejects any non-platform_admin
 * credential pair outright rather than issuing a normal session.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const denied = searchParams.get('denied') === '1';
  const { user } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(denied ? 'That account does not have admin access.' : null);
  const [loading, setLoading] = useState(false);

  // Already an authenticated admin (e.g. navigated here directly) — skip
  // straight to the dashboard instead of asking them to log in again.
  useEffect(() => {
    if (user?.role === 'platform_admin') router.replace('/admin');
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const loggedInUser = await authClient.login({ email, password, context: 'admin' });
      if (loggedInUser.role !== 'platform_admin') {
        // Defense in depth — the server already rejects this, but if it
        // somehow didn't, never leave a non-admin sitting on a session
        // established through the admin entry point.
        await authClient.logout();
        setError('That account does not have admin access.');
        return;
      }
      router.push('/admin');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-analytics/10 border border-analytics/30 flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6 text-analytics" />
          </div>
          <div className="flex items-center gap-2 mb-1">
            <Logomark className="w-4 h-4 text-ink-faint" />
            <span className="font-mono text-xs tracking-[0.14em] text-ink-faint uppercase">LetsMove</span>
          </div>
          <h1 className="font-display text-display-m text-ink">Platform Admin</h1>
          <p className="text-ink-muted text-sm mt-1">Restricted access — administrators only.</p>
        </div>

        <div className="bg-panel border border-hairline rounded-lg p-6 shadow-lg">
          {error && <div className="mb-5"><ErrorBlock message={error} /></div>}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="admin-email"
              type="email"
              label="Email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@letsmove.app"
            />
            <Input
              id="admin-password"
              type="password"
              label="Password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
            <Button type="submit" variant="analytics" disabled={!canSubmit} loading={loading} className="mt-2 w-full">
              {loading ? 'Verifying…' : 'Enter admin area'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-ink-faint mt-6">
          Not an administrator?{' '}
          <a href="/login" className="text-ink-muted hover:text-ink underline decoration-dotted">
            Go to the regular sign in
          </a>
        </p>
      </div>
    </div>
  );
}
