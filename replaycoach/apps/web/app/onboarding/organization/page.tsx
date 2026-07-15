'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { orgClient } from '../../../lib/org-client';
import { authClient } from '../../../lib/auth-client';
import { Logomark } from '../../components/Logomark';
import { SkeletonMotif } from '../../components/SkeletonMotif';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ErrorBlock } from '../../components/ui/StateBlocks';

/** Forced one-time step for a coach/studio_admin with no organization yet
 * (see AuthInitializer's org-onboarding redirect). Every other screen in the
 * product assumes org context, so this has to happen before anything else —
 * it's the "start a business" moment, not optional profile setup. */
export default function OrganizationOnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await orgClient.createOrganization({ name });
      // Creating the org promotes this user to studio_admin and bumps their
      // sessionVersion server-side — the access token already in the store
      // is now stale, so refresh to pick up the new role/orgId.
      await authClient.refresh();
      router.push('/coach');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not create your organization. Try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink relative overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen">
        <div className="hidden lg:flex flex-col justify-center p-16 relative overflow-hidden">
          <SkeletonMotif className="absolute -right-10 -bottom-5 w-[360px] h-[420px] opacity-[0.10]" jointColor="brand" />
          <div className="flex items-center gap-2.5 mb-7">
            <Logomark className="w-5 h-5 text-brand" />
            <span className="font-display text-display-s">ReplayCoach</span>
          </div>
          <h1 className="font-display text-display-l text-ink max-w-[24rem] text-balance">
            One organization. Every coach, every student, one place.
          </h1>
        </div>

        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-[25rem] bg-panel border border-hairline rounded-lg shadow-lg p-9 animate-rise">
            <div className="flex items-center gap-2.5 mb-5">
              <Logomark className="w-5 h-5 text-brand flex-shrink-0" />
              <div>
                <h2 className="font-display text-display-s leading-tight">Name your organization</h2>
                <p className="text-ink-muted text-sm mt-0.5">You'll invite coaches and students to it next.</p>
              </div>
            </div>

            {error && <div className="mb-5"><ErrorBlock message={error} /></div>}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                id="org-name"
                type="text"
                label="Organization name"
                autoComplete="organization"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pole Dance Academy"
              />
              <Button type="submit" disabled={name.trim().length < 2 || loading} loading={loading} className="w-full">
                {loading ? 'Creating…' : 'Create organization'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
