'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../../../lib/auth-client';

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
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-brand-indigo to-brand-violet flex-shrink-0" />
        <div>
          <h2 className="font-display font-semibold text-lg leading-tight">Welcome back</h2>
          <p className="text-ink-muted text-sm mt-0.5">Sign in to your film room.</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger text-xs rounded-lg px-3.5 py-2.5 mb-5 animate-rise">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="auth-email" className="block text-xs text-ink-muted mb-1.5">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-panel-2 border border-hairline rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-all duration-150 focus:outline-none focus-visible:border-brand-indigo/60 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]"
            placeholder="you@club.com"
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="block text-xs text-ink-muted mb-1.5">Password</label>
          <div className="relative">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-panel-2 border border-hairline rounded-lg px-3.5 py-2.5 pr-12 text-sm text-ink placeholder:text-ink-faint transition-all duration-150 focus:outline-none focus-visible:border-brand-indigo/60 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]"
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

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-2 w-full font-semibold text-sm text-canvas bg-gradient-to-r from-brand-indigo to-brand-violet rounded-full py-3 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-glow transition-all duration-150 flex items-center justify-center gap-2"
        >
          {loading && <span className="w-3.5 h-3.5 rounded-full border-2 border-canvas/30 border-t-canvas animate-spin" />}
          {loading ? 'Signing in…' : 'Log in'}
        </button>
      </form>

      <div className="flex items-center gap-3 my-[22px]">
        <div className="flex-1 h-px bg-hairline" />
        <span className="text-xs text-ink-faint">or</span>
        <div className="flex-1 h-px bg-hairline" />
      </div>

      <button
        type="button"
        disabled
        className="w-full flex items-center justify-center gap-2.5 bg-panel-2 border border-hairline rounded-lg py-2.5 text-ink-faint text-sm cursor-not-allowed"
      >
        <span aria-hidden>G</span> Continue with Google
        <span className="font-mono text-[0.6875rem] text-ink-faint bg-hairline px-2 py-0.5 rounded-full">coming soon</span>
      </button>

      <div className="text-center mt-6 text-sm text-ink-muted">
        New here?{' '}
        <Link
          href={redirectTo ? `/register?redirectTo=${encodeURIComponent(redirectTo)}` : '/register'}
          className="text-brand-violet hover:text-brand-violet/80 font-semibold"
        >
          Sign up
        </Link>
      </div>
    </>
  );
}
