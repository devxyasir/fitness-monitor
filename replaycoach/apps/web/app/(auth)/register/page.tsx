'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../../../lib/auth-client';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'coach' | 'student'>('coach');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await authClient.register({
        email,
        password,
        displayName,
        role,
      });

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
      setError((err as Error).message ?? 'Registration failed. Try again.');
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
            <p className="text-sm text-ink-muted">Create your coach or student account.</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-danger/10 border border-danger/30 text-danger text-xs rounded-md">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="displayName" className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input"
                placeholder="Coach Carter"
              />
            </div>

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
                placeholder="coach@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••••••"
              />
              <p className="mt-1.5 text-[10px] text-ink-faint">
                Min 8 chars, 1 uppercase, 1 lowercase, 1 digit.
              </p>
            </div>

            <div>
              <label htmlFor="role" className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
                I am registering as a:
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'coach' | 'student')}
                className="input"
              >
                <option value="coach">Coach / Instructor</option>
                <option value="student">Student / Athlete</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-ink-faint">
            Already have an account?{' '}
            <Link
              href={redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login'}
              className="text-brand-indigo hover:underline font-semibold"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
