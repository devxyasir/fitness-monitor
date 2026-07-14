'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../../../lib/auth-client';
import { Logomark } from '../../components/Logomark';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ErrorBlock } from '../../components/ui/StateBlocks';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await authClient.login({ email, password });
      const isValidRedirect = redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//');
      if (isValidRedirect) {
        router.push(redirectTo);
      } else if (user.role === 'platform_admin' || user.role === 'studio_admin' || user.role === 'coach') {
        router.push('/coach');
      } else {
        router.push('/student/sessions');
      }
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  return (
    <>
      <div className="flex items-center gap-2.5 mb-5">
        <Logomark className="w-5 h-5 text-brand flex-shrink-0" />
        <div>
          <h2 className="font-display text-display-s leading-tight">Welcome back</h2>
          <p className="text-ink-muted text-sm mt-0.5">Sign in to your film room.</p>
        </div>
      </div>

      {error && <div className="mb-5"><ErrorBlock message={error} /></div>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="auth-email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@club.com"
        />

        <div>
          <label htmlFor="auth-password" className="block text-label text-ink-muted mb-1.5">Password</label>
          <div className="relative">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-panel-2 border border-hairline rounded-sm px-3.5 py-2.5 pr-12 text-sm text-ink placeholder:text-ink-faint transition-all duration-150 focus:outline-none focus-visible:border-brand focus-visible:shadow-focus"
              placeholder="••••••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-none border-none text-ink-muted text-xs cursor-pointer px-2 py-1.5 rounded"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <Button type="submit" disabled={!canSubmit} loading={loading} className="mt-2 w-full">
          {loading ? 'Signing in…' : 'Log in'}
        </Button>
      </form>

      <div className="flex items-center gap-3 my-[22px]">
        <div className="flex-1 h-px bg-hairline" />
        <span className="text-xs text-ink-faint">or</span>
        <div className="flex-1 h-px bg-hairline" />
      </div>

      <Button variant="ghost" disabled className="w-full">
        <span aria-hidden>G</span> Continue with Google
        <span className="font-mono text-[0.6875rem] text-ink-faint bg-hairline px-2 py-0.5 rounded-full ml-auto">coming soon</span>
      </Button>

      <div className="text-center mt-6 text-sm text-ink-muted">
        New here?{' '}
        <Link
          href={redirectTo ? `/register?redirectTo=${encodeURIComponent(redirectTo)}` : '/register'}
          className="text-brand hover:brightness-110 font-semibold"
        >
          Sign up
        </Link>
      </div>
    </>
  );
}
