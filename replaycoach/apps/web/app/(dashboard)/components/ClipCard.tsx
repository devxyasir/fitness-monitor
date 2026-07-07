'use client';

import { useState } from 'react';
import { Play, Video, Download, Share2 } from 'lucide-react';
import type { ClipItem } from './clipsShared';
import { downloadClipVideo } from './downloadClip';

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
      alert('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-900 rounded-3xl p-5 flex flex-col justify-between hover:border-slate-800 transition group shadow-md">
      <div>
        <div
          className="aspect-video w-full rounded-2xl mb-4 bg-gradient-to-tr from-slate-950 to-indigo-950/20 flex items-center justify-center relative border border-slate-800 overflow-hidden cursor-pointer"
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
            <Video className="w-6 h-6 opacity-60" />
          )}

          <div className="absolute inset-0 bg-slate-900/25 opacity-0 group-hover:opacity-100 transition flex items-center justify-center backdrop-blur-[2px]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlay(clip);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-full shadow-lg transform scale-90 group-hover:scale-100 transition duration-300"
            >
              <Play className="w-5 h-5 fill-current" />
            </button>
          </div>
          <span className="absolute bottom-2 right-2 bg-slate-950/80 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold text-slate-300 tracking-wider">
            {formatDuration(clip.startMs, clip.endMs)}
          </span>
        </div>

        <h3 className="text-sm font-bold text-white group-hover:text-indigo-400 transition truncate">
          {clip.title}
        </h3>
      </div>

      <div className="flex gap-2.5 mt-4">
        <button
          onClick={() => onPlay(clip)}
          className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold tracking-wide transition border border-slate-700 inline-flex items-center justify-center gap-1.5"
        >
          <Play className="w-3.5 h-3.5 fill-current" /> Play
        </button>
        {clip.downloadable && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="py-2 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition border border-slate-700 inline-flex items-center justify-center gap-1.5"
            title="Download video"
          >
            <Download className="w-3.5 h-3.5" /> {downloading ? '…' : ''}
          </button>
        )}
        {onShare && (
          <button
            onClick={() => onShare(clip)}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold tracking-wide transition inline-flex items-center justify-center gap-1.5"
          >
            <Share2 className="w-3.5 h-3.5" /> Share ({clip.sharesCount ?? 0})
          </button>
        )}
      </div>
    </div>
  );
}
