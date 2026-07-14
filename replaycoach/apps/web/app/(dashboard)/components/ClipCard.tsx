'use client';

import { useState } from 'react';
import { Play, Video, Download, Share2 } from 'lucide-react';
import type { ClipItem } from './clipsShared';
import { downloadClipVideo } from './downloadClip';
import { toast } from '../../../stores/toast-store';

function formatDuration(startMs: number, endMs: number): string {
  const totalSecs = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

interface ClipCardProps {
  clip: ClipItem;
  onPlay: (clip: ClipItem) => void;
  /** Coach-only share action; omitted for students. */
  onShare?: ((clip: ClipItem) => void) | undefined;
}

/**
 * A single clip card with a real video-preview thumbnail (the processed
 * overlay video seeked to its first frame, so the skeleton is visible),
 * plus play / download / share actions.
 */
export function ClipCard({ clip, onPlay, onShare }: ClipCardProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadClipVideo({
        clipId: clip.id,
        startedAt: clip.meeting?.startedAt,
        playUrl: clip.videoUrl ?? undefined,
      });
    } catch (err) {
      console.error('[ClipCard] Download failed:', err);
      toast.error('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-panel border border-hairline rounded-lg p-5 flex flex-col justify-between hover:border-brand-indigo/25 transition-colors group">
      <div>
        <div
          className="aspect-video w-full rounded-lg mb-4 bg-gradient-to-tr from-panel-2 to-brand-indigo/10 flex items-center justify-center relative border border-hairline overflow-hidden cursor-pointer"
          onClick={() => onPlay(clip)}
        >
          {clip.videoUrl ? (
            // #t=0.1 makes the browser render the frame at 0.1s as a poster —
            // a real preview of the processed video with the skeleton visible.
            <video
              src={`${clip.videoUrl}#t=0.1`}
              muted
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
            />
          ) : (
            <Video className="w-6 h-6 text-ink-faint opacity-60" />
          )}

          <div className="absolute inset-0 bg-canvas/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlay(clip);
              }}
              className="bg-gradient-to-br from-brand-indigo to-brand-violet text-canvas p-3 rounded-full shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-300"
            >
              <Play className="w-5 h-5 fill-current" />
            </button>
          </div>
          <span className="absolute bottom-2 right-2 bg-panel/80 backdrop-blur-glass px-2 py-0.5 rounded-full text-[10px] font-mono font-bold text-ink-muted tracking-wider">
            {formatDuration(clip.startMs, clip.endMs)}
          </span>
        </div>

        <h3 className="text-sm font-display font-semibold text-ink group-hover:text-brand-violet transition-colors truncate">
          {clip.title}
        </h3>
      </div>

      <div className="flex gap-2.5 mt-4">
        <button
          onClick={() => onPlay(clip)}
          className="flex-1 py-2 bg-panel-2 hover:bg-panel-2/60 text-ink rounded-full text-xs font-semibold tracking-wide transition-colors border border-hairline inline-flex items-center justify-center gap-1.5"
        >
          <Play className="w-3.5 h-3.5 fill-current" /> Play
        </button>
        {clip.downloadable && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="py-2 px-3 bg-panel-2 hover:bg-panel-2/60 disabled:opacity-50 text-ink rounded-full text-xs font-semibold transition-colors border border-hairline inline-flex items-center justify-center gap-1.5"
            title="Download video"
          >
            <Download className="w-3.5 h-3.5" /> {downloading ? '…' : ''}
          </button>
        )}
        {onShare && (
          <button
            onClick={() => onShare(clip)}
            className="flex-1 py-2 bg-gradient-to-r from-brand-indigo to-brand-violet hover:shadow-glow text-canvas rounded-full text-xs font-semibold tracking-wide transition-all inline-flex items-center justify-center gap-1.5"
          >
            <Share2 className="w-3.5 h-3.5" /> Share ({clip.sharesCount ?? 0})
          </button>
        )}
      </div>
    </div>
  );
}
