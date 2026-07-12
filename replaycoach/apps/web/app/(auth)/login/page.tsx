'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../../../lib/auth-client';
import { useAuthStore } from '../../../stores/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await authClient.login({ email, password, rememberMe });
      
      // Redirect based on role or query redirect param
      const isValidRedirect = redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//');
      if (isValidRedirect) {
        router.push(redirectTo);
      } else if (user.role === 'platform_admin' || user.role === 'studio_admin' || user.role === 'coach') {
        router.push('/coach/clips');
      } else {
        router.push('/student/sessions');
      }
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="relative w-full max-w-md glass rounded-lg shadow-2xl p-8 overflow-hidden animate-rise">
        {/* Glow effect */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-indigo/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-brand-violet/10 rounded-full blur-3xl" />

        <div className="relative z-10">
          <div className="mb-8 text-center">
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink mb-2">
              Replay<span className="bg-gradient-to-r from-brand-indigo to-brand-violet bg-clip-text text-transparent">Coach</span>
            </h1>
            <p className="text-sm text-ink-muted">Welcome back. Enter your credentials to sign in.</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-danger/10 border border-danger/30 text-danger text-xs rounded-md">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label htmlFor="password" className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
                  Password
                </label>
                <a href="#" className="text-xs text-brand-indigo hover:underline">
                  Forgot?
                </a>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••••••"
              />
            </div>

            <label htmlFor="rememberMe" className="flex items-center gap-2 cursor-pointer select-none">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-transparent accent-brand-indigo"
              />
              <span className="text-xs text-ink-muted">Stay signed in on this device</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-ink-faint">
            Don&apos;t have an account?{' '}
            <Link
              href={redirectTo ? `/register?redirectTo=${encodeURIComponent(redirectTo)}` : '/register'}
              className="text-brand-indigo hover:underline font-semibold"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
