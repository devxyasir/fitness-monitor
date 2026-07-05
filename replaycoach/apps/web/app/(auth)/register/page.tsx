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
    <div className="min-h-screen flex items-center justify-center bg-radial-dark p-6">
      <div className="relative w-full max-w-md bg-zinc-900/80 border border-zinc-800 rounded-2xl shadow-2xl p-8 backdrop-blur-md overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />

        <div className="relative z-10">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
              Replay<span className="text-blue-500">Coach</span>
            </h1>
            <p className="text-sm text-zinc-400">Create your coach or student account.</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-950/40 border border-red-800/80 text-red-400 text-xs rounded-lg animate-pulse">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="displayName" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Coach Carter"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="coach@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••••••"
              />
              <p className="mt-1.5 text-[10px] text-zinc-500">
                Min 8 chars, 1 uppercase, 1 lowercase, 1 digit.
              </p>
            </div>

            <div>
              <label htmlFor="role" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                I am registering as a:
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'coach' | 'student')}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="coach">Coach / Instructor</option>
                <option value="student">Student / Athlete</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium py-3 rounded-lg text-sm transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01]"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-zinc-500">
            Already have an account?{' '}
            <Link
              href={redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login'}
              className="text-blue-400 hover:underline font-semibold"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
