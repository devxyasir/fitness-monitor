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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await authClient.login({ email, password });
      
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
            <p className="text-sm text-zinc-400">Welcome back. Enter your credentials to sign in.</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-950/40 border border-red-800/80 text-red-400 text-xs rounded-lg animate-pulse">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
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
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label htmlFor="password" className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Password
                </label>
                <a href="#" className="text-xs text-blue-500 hover:underline">
                  Forgot?
                </a>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium py-3 rounded-lg text-sm transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01]"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-zinc-500">
            Don&apos;t have an account?{' '}
            <Link
              href={redirectTo ? `/register?redirectTo=${encodeURIComponent(redirectTo)}` : '/register'}
              className="text-blue-400 hover:underline font-semibold"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
