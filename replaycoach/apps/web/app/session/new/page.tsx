'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Radio, CalendarClock } from 'lucide-react';
import type { CreateSessionDto, SessionDto } from '@replaycoach/types';
import { apiClient } from '../../../lib/api-client';
import { toast } from '../../../stores/toast-store';
import { Logomark } from '../../components/Logomark';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ErrorBlock } from '../../components/ui/StateBlocks';

/** The primary "start using the product" flow — every dashboard page's
 * topbar "+ New session" button lands here. Previously this route didn't
 * exist at all: Next.js matched the literal path "new" against the
 * sibling /session/[id] dynamic route, so it rendered the session-room
 * page with a session ID of "new", which the API rejected with a
 * Postgres "invalid input syntax for type uuid" error — the button was
 * completely non-functional. */
export default function NewSessionPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'instant' | 'scheduled'>('instant');
  const [scheduledAt, setScheduledAt] = useState('');
  const [accessType, setAccessType] = useState<'public' | 'lobby'>('public');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'scheduled' && !scheduledAt) {
      setError('Pick a date and time for this session.');
      return;
    }

    setLoading(true);
    try {
      const dto: CreateSessionDto = {
        scheduledAt: mode === 'instant' ? new Date().toISOString() : new Date(scheduledAt).toISOString(),
        isInstant: mode === 'instant',
        accessType,
      };
      const session = await apiClient.post<CreateSessionDto, SessionDto>('/sessions', dto);
      if (mode === 'instant') {
        router.push(`/session/${session.id}`);
      } else {
        toast.success('Session scheduled.');
        router.push('/coach/sessions');
      }
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not create this session.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-panel border border-hairline rounded-lg shadow-lg p-9 animate-rise">
        <div className="flex items-center gap-2.5 mb-5">
          <Logomark className="w-5 h-5 text-brand flex-shrink-0" />
          <div>
            <h1 className="font-display text-display-s leading-tight">New session</h1>
            <p className="text-ink-muted text-sm mt-0.5">Start now, or schedule it for later.</p>
          </div>
        </div>

        {error && <div className="mb-5"><ErrorBlock message={error} /></div>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-label text-ink-muted mb-1.5">When</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('instant')}
                className={`flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-sm text-sm border transition-colors ${
                  mode === 'instant' ? 'bg-brand/10 border-brand text-brand font-medium' : 'bg-panel-2 border-hairline text-ink-muted hover:text-ink'
                }`}
              >
                <Radio className="w-3.5 h-3.5" /> Start now
              </button>
              <button
                type="button"
                onClick={() => setMode('scheduled')}
                className={`flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-sm text-sm border transition-colors ${
                  mode === 'scheduled' ? 'bg-brand/10 border-brand text-brand font-medium' : 'bg-panel-2 border-hairline text-ink-muted hover:text-ink'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5" /> Schedule
              </button>
            </div>
          </div>

          {mode === 'scheduled' && (
            <Input
              id="scheduled-at"
              type="datetime-local"
              label="Date & time"
              required
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
            />
          )}

          <div>
            <label className="block text-label text-ink-muted mb-1.5">Who can join</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAccessType('public')}
                className={`flex-1 px-3.5 py-2.5 rounded-sm text-sm border transition-colors ${
                  accessType === 'public' ? 'bg-brand/10 border-brand text-brand font-medium' : 'bg-panel-2 border-hairline text-ink-muted hover:text-ink'
                }`}
              >
                Anyone with the link
              </button>
              <button
                type="button"
                onClick={() => setAccessType('lobby')}
                className={`flex-1 px-3.5 py-2.5 rounded-sm text-sm border transition-colors ${
                  accessType === 'lobby' ? 'bg-brand/10 border-brand text-brand font-medium' : 'bg-panel-2 border-hairline text-ink-muted hover:text-ink'
                }`}
              >
                Approve each dancer
              </button>
            </div>
          </div>

          <Button type="submit" loading={loading} className="w-full mt-2">
            {loading ? 'Creating…' : mode === 'instant' ? 'Start session' : 'Schedule session'}
          </Button>
        </form>
      </div>
    </div>
  );
}
