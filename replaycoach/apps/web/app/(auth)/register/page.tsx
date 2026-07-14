'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../../../lib/auth-client';
import { Logomark } from '../../components/Logomark';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ErrorBlock } from '../../components/ui/StateBlocks';

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
  const [passwordTouched, setPasswordTouched] = useState(false);

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

  const passwordValid = PASSWORD_RULES.every((r) => r.test(password));
  const canSubmit = displayName.trim().length > 0 && email.trim().length > 0 && passwordValid && !loading;

  return (
    <>
      <div className="flex items-center gap-2.5 mb-5">
        <Logomark className="w-5 h-5 text-brand flex-shrink-0" />
        <div>
          <h2 className="font-display text-display-s leading-tight">Create your account</h2>
          <p className="text-ink-muted text-sm mt-0.5">Set up your coaching room in a minute.</p>
        </div>
      </div>

      {error && <div className="mb-5"><ErrorBlock message={error} /></div>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="reg-name"
          type="text"
          label="Full name"
          autoComplete="name"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Coach Carter"
        />

        <Input
          id="reg-email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="coach@example.com"
        />

        <div>
          <label htmlFor="reg-password" className="block text-label text-ink-muted mb-1.5">Password</label>
          <div className="relative">
            <input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordTouched(true)}
              className="w-full bg-panel-2 border border-hairline rounded-sm px-3.5 py-2.5 pr-12 text-sm text-ink placeholder:text-ink-faint transition-all duration-150 focus:outline-none focus-visible:border-brand focus-visible:shadow-focus"
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
                    className={`text-[11px] flex items-center gap-1.5 transition-colors ${met ? 'text-success' : 'text-ink-faint'}`}
                  >
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

        <div>
          <label htmlFor="reg-role" className="block text-label text-ink-muted mb-1.5">I am registering as a</label>
          <select
            id="reg-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'coach' | 'student')}
            className="w-full bg-panel-2 border border-hairline rounded-sm px-3.5 py-2.5 text-sm text-ink transition-all duration-150 focus:outline-none focus-visible:border-brand focus-visible:shadow-focus"
          >
            <option value="coach">Coach / Instructor</option>
            <option value="student">Student / Athlete</option>
          </select>
        </div>

        <Button type="submit" disabled={!canSubmit} loading={loading} className="mt-2 w-full">
          {loading ? 'Creating account…' : 'Create account'}
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
        Have an account?{' '}
        <Link
          href={redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login'}
          className="text-brand hover:brightness-110 font-semibold"
        >
          Log in
        </Link>
      </div>
    </>
  );
}
