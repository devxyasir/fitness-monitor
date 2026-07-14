'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../../../lib/auth-client';

// Mirrors apps/api/src/auth/auth.dto.ts's PASSWORD_REGEX exactly — min 8
// chars, at least one uppercase, one lowercase, one digit — so the client
// never lets a user submit a password the API will reject.
const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One digit', test: (p: string) => /\d/.test(p) },
];

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'coach' | 'student'>('coach');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await authClient.register({ email, password, displayName, role });
      const isValidRedirect = redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//');
      if (isValidRedirect) {
        router.push(redirectTo);
      } else if (user.role === 'platform_admin' || user.role === 'studio_admin' || user.role === 'coach') {
        router.push('/coach');
      } else {
        router.push('/student/sessions');
      }
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const [passwordTouched, setPasswordTouched] = useState(false);
  const passwordValid = PASSWORD_RULES.every((r) => r.test(password));
  const canSubmit = displayName.trim().length > 0 && email.trim().length > 0 && passwordValid && !loading;

  return (
    <>
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-brand-indigo to-brand-violet flex-shrink-0" />
        <div>
          <h2 className="font-display font-semibold text-lg leading-tight">Create your account</h2>
          <p className="text-ink-muted text-sm mt-0.5">Set up your coaching room in a minute.</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger text-xs rounded-lg px-3.5 py-2.5 mb-5 animate-rise">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="reg-name" className="block text-xs text-ink-muted mb-1.5">Full name</label>
          <input
            id="reg-name"
            type="text"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-panel-2 border border-hairline rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-all duration-150 focus:outline-none focus-visible:border-brand-indigo/60 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]"
            placeholder="Coach Carter"
          />
        </div>

        <div>
          <label htmlFor="reg-email" className="block text-xs text-ink-muted mb-1.5">Email</label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-panel-2 border border-hairline rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-all duration-150 focus:outline-none focus-visible:border-brand-indigo/60 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]"
            placeholder="coach@example.com"
          />
        </div>

        <div>
          <label htmlFor="reg-password" className="block text-xs text-ink-muted mb-1.5">Password</label>
          <div className="relative">
            <input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordTouched(true)}
              className="w-full bg-panel-2 border border-hairline rounded-lg px-3.5 py-2.5 pr-12 text-sm text-ink placeholder:text-ink-faint transition-all duration-150 focus:outline-none focus-visible:border-brand-indigo/60 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]"
              placeholder="Min 8 chars, upper + lower + digit"
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
          {passwordTouched && (
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 animate-rise">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(password);
                return (
                  <li
                    key={rule.label}
                    className={`text-[11px] flex items-center gap-1.5 transition-colors ${met ? 'text-live' : 'text-ink-faint'}`}
                  >
                    <span className={`w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0 ${met ? 'bg-live/20' : 'bg-panel-2 border border-hairline'}`}>
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

        <div>
          <label htmlFor="reg-role" className="block text-xs text-ink-muted mb-1.5">I am registering as a</label>
          <select
            id="reg-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'coach' | 'student')}
            className="w-full bg-panel-2 border border-hairline rounded-lg px-3.5 py-2.5 text-sm text-ink transition-all duration-150 focus:outline-none focus-visible:border-brand-indigo/60 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]"
          >
            <option value="coach">Coach / Instructor</option>
            <option value="student">Student / Athlete</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-2 w-full font-semibold text-sm text-canvas bg-gradient-to-r from-brand-indigo to-brand-violet rounded-full py-3 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-glow transition-all duration-150 flex items-center justify-center gap-2"
        >
          {loading && <span className="w-3.5 h-3.5 rounded-full border-2 border-canvas/30 border-t-canvas animate-spin" />}
          {loading ? 'Creating account…' : 'Create account'}
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
        Have an account?{' '}
        <Link
          href={redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login'}
          className="text-brand-violet hover:text-brand-violet/80 font-semibold"
        >
          Log in
        </Link>
      </div>
    </>
  );
}
