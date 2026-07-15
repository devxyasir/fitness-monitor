'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Hls from 'hls.js';
import { ArrowLeft, Clock, VideoOff } from 'lucide-react';
import type { SessionRecordingDto } from '@replaycoach/types';
import { apiClient } from '../../../../lib/api-client';
import { Logomark } from '../../../components/Logomark';
import { PageLoader } from '../../../components/ui/PageLoader';
import { StateBlock, ErrorBlock } from '../../../components/ui/StateBlocks';

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/** Post-session review — plays back the whole-room composite recording.
 * This is the destination for the "Replay" action on an ended session in
 * the sessions list (previously that link pointed at the live session-room
 * route, which has no recording-playback path and just showed the generic
 * "this session has ended" dead end). */
export default function SessionReviewPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const [recording, setRecording] = useState<SessionRecordingDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiClient
      .get<SessionRecordingDto>(`/sessions/${sessionId}/recording`)
      .then(setRecording)
      .catch((err: unknown) => setError((err as Error).message ?? 'Could not load this recording.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [sessionId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || recording?.state !== 'ready' || !recording.playUrl) return;
    const playUrl = recording.playUrl;

    if (Hls.isSupported()) {
      const hls = new Hls({ maxMaxBufferLength: 8, enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(playUrl);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playUrl;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [recording]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-10 bg-panel/85 backdrop-blur-md border-b border-hairline px-4 sm:px-7 py-4 flex items-center gap-3">
        <Link href="/coach/sessions" className="text-ink-muted hover:text-ink transition-colors" aria-label="Back to sessions">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Logomark className="w-5 h-5 text-brand" />
        <h1 className="font-display text-display-s">Session recording</h1>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-7">
        {loading ? (
          <PageLoader label="Loading recording" />
        ) : error ? (
          <ErrorBlock message={error} onRetry={load} />
        ) : recording?.state === 'ready' && recording.playUrl ? (
          <div>
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-hairline">
              <video ref={videoRef} controls playsInline className="absolute inset-0 w-full h-full" />
            </div>
            {recording.durationSeconds > 0 && (
              <p className="mt-3 text-xs text-ink-faint font-mono flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> {formatDuration(recording.durationSeconds)}
              </p>
            )}
          </div>
        ) : recording?.state === 'processing' ? (
          <StateBlock
            icon={<Clock />}
            title="Still processing"
            body="This session's recording is being finalized. Check back in a few minutes."
          />
        ) : (
          <StateBlock
            icon={<VideoOff />}
            title="No recording available"
            body="This session doesn't have a recording — it may have been too short, or recording wasn't enabled."
          />
        )}
      </main>
    </div>
  );
}
