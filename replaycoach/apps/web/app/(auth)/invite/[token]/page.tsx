'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { InvitePreviewDto } from '@replaycoach/types';
import { orgClient } from '../../../../lib/org-client';
import { useAuthStore } from '../../../../stores/auth-store';
import { Logomark } from '../../../components/Logomark';
import { Button } from '../../../components/ui/Button';
import { ErrorBlock } from '../../../components/ui/StateBlocks';

/** Public invite landing page — the entry point for every coach/student who
 * joins an existing organization (open self-signup only ever creates a NEW
 * org; this is the other half of onboarding). Works whether the visitor is
 * logged out (leads to /register with the token pre-filled) or already
 * logged in (leads to a one-click accept, enforced server-side to match the
 * invited email). */
export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { user, accessToken } = useAuthStore();

  const [invite, setInvite] = useState<InvitePreviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    orgClient
      .getInvitePreview(token)
      .then((preview) => {
        if (preview.expired) setPreviewError('This invite link has expired. Ask your coach to send a new one.');
        else if (preview.alreadyUsed) setPreviewError('This invite has already been used.');
        else setInvite(preview);
      })
      .catch(() => setPreviewError('This invite link is invalid.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setAcceptError(null);
    try {
      const updated = await orgClient.acceptInvite(token);
      router.push(updated.role === 'student' ? '/student/sessions' : '/coach');
    } catch (err: unknown) {
      setAcceptError((err as Error).message ?? 'Could not accept this invite.');
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2.5">
        <Logomark className="w-5 h-5 text-brand flex-shrink-0 animate-mark-breathe" />
        <p className="text-ink-muted text-sm">Checking your invite…</p>
      </div>
    );
  }

  if (previewError || !invite) {
    return (
      <>
        <div className="flex items-center gap-2.5 mb-5">
          <Logomark className="w-5 h-5 text-brand flex-shrink-0" />
          <h2 className="font-display text-display-s leading-tight">Invite link problem</h2>
        </div>
        <ErrorBlock message={previewError ?? 'This invite link is invalid.'} />
        <div className="text-center mt-6 text-sm text-ink-muted">
          <Link href="/login" className="text-brand hover:brightness-110 font-semibold">Log in</Link> or{' '}
          <Link href="/register" className="text-brand hover:brightness-110 font-semibold">create an account</Link>
        </div>
      </>
    );
  }

  const roleLabel = invite.role === 'student' ? 'a student' : 'a coach';

  return (
    <>
      <div className="flex items-center gap-2.5 mb-5">
        <Logomark className="w-5 h-5 text-brand flex-shrink-0" />
        <h2 className="font-display text-display-s leading-tight">You're invited</h2>
      </div>
      <p className="text-ink-muted text-sm mb-7 leading-relaxed">
        Join <span className="text-ink font-medium">{invite.orgName}</span> as {roleLabel}
        {invite.teamName ? (
          <>
            {' '}on <span className="text-ink font-medium">{invite.teamName}</span>
          </>
        ) : null}
        .
      </p>

      {acceptError && <div className="mb-5"><ErrorBlock message={acceptError} /></div>}

      {accessToken && user ? (
        <>
          <div className="text-xs text-ink-faint bg-panel-2 border border-hairline rounded-sm px-3.5 py-2.5 mb-4">
            Signed in as <span className="text-ink font-medium">{user.email}</span>
          </div>
          <Button onClick={handleAccept} loading={accepting} className="w-full">
            {accepting ? 'Joining…' : `Accept & join ${invite.orgName}`}
          </Button>
          <p className="text-center mt-3 text-xs text-ink-faint">
            Wrong account? <Link href="/login" className="text-brand hover:brightness-110">Log in as someone else</Link>
          </p>
        </>
      ) : (
        <>
          <Button href={`/register?invite=${encodeURIComponent(token)}`} className="w-full">
            Create your account
          </Button>
          <p className="text-center mt-4 text-sm text-ink-muted">
            Already have an account?{' '}
            <Link href={`/login?redirectTo=${encodeURIComponent(`/invite/${token}`)}`} className="text-brand hover:brightness-110 font-semibold">
              Log in to accept
            </Link>
          </p>
        </>
      )}
    </>
  );
}
