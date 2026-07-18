'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import type { ClientAnnotation } from '../../../stores/annotation-store';
import { getVisibleAnnotations } from '../../../stores/annotation-store';
import { X, Play, Pause, Palette, Download, Bone, PenLine, Loader2 } from 'lucide-react';
import { apiClient } from '../../../lib/api-client';
import { downloadClipVideo } from './downloadClip';
import { toast } from '../../../stores/toast-store';
import { useVideoOverlayRect } from '../../../lib/hooks/useVideoOverlayRect';
import { drawLine, drawArrow, drawCircle, drawPointMarker, drawAngle, drawTextLabel } from '../../../lib/annotation-drawing';

interface ClipPlaybackModalProps {
  clip: {
    id: string;
    title: string;
    startMs: number;
    endMs: number;
    sessionId: string;
    clipType?: 'recording' | 'reference';
    downloadable?: boolean;
    referenceVideoId?: string | null;
    meeting?: { startedAt: string };
  };
  playUrl: string;
  annotations: ClientAnnotation[];
  onClose: () => void;
  /** Only the coach can trigger a server-side re-export (assertCoach on the
   * API); students can still download whatever was last exported. */
  isCoach?: boolean;
}

const EXPORT_POLL_INTERVAL_MS = 2500;
const EXPORT_POLL_TIMEOUT_MS = 90_000;

export function ClipPlaybackModal({ clip, playUrl, annotations, onClose, isCoach = false }: ClipPlaybackModalProps) {
  const [downloading, setDownloading] = useState(false);
  // Re-export flow (only for reference clips with a referenceVideoId): the
  // coach/student picks a mode, we kick off a fresh server-side render, poll
  // until the clip's underlying file changes, then download that result.
  const [exportingMode, setExportingMode] = useState<'skeleton' | 'annotations' | null>(null);
  const [showModeChooser, setShowModeChooser] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      // Reuse the already-authorized playUrl the modal is streaming.
      await downloadClipVideo({ clipId: clip.id, startedAt: clip.meeting?.startedAt, playUrl });
    } catch (err) {
      console.error('[ClipPlaybackModal] Download failed:', err);
      toast.error('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const exportKeyOf = (url: string) => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  };

  const handleExportAndDownload = async (drawSkeleton: boolean) => {
    if (exportingMode || !clip.referenceVideoId) return;
    setShowModeChooser(false);
    setExportingMode(drawSkeleton ? 'skeleton' : 'annotations');
    const priorKey = exportKeyOf(playUrl);
    try {
      await apiClient.post(`/sessions/${clip.sessionId}/reference/${clip.referenceVideoId}/export`, { drawSkeleton });

      const deadline = Date.now() + EXPORT_POLL_TIMEOUT_MS;
      let freshUrl: string | null = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, EXPORT_POLL_INTERVAL_MS));
        const res = await apiClient.get<{ playUrl: string }>(`/clips/${clip.id}`);
        if (exportKeyOf(res.playUrl) !== priorKey) {
          freshUrl = res.playUrl;
          break;
        }
      }
      if (!freshUrl) throw new Error('Export is taking longer than expected. Try downloading again shortly.');
      await downloadClipVideo({ clipId: clip.id, startedAt: clip.meeting?.startedAt, playUrl: freshUrl });
    } catch (err) {
      console.error('[ClipPlaybackModal] Export/download failed:', err);
      toast.error(err instanceof Error ? err.message : 'Export failed. Please try again.');
    } finally {
      setExportingMode(null);
    }
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const overlayRect = useVideoOverlayRect(containerRef, videoRef);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0); // seconds
  const [duration, setDuration] = useState(0); // seconds
  const [showAnnotations, setShowAnnotations] = useState(true);

  // Group and fetch current active annotations based on playhead time
  const currentTimeMs = Math.floor(currentTime * 1000);
  
  // Find the closest past annotated frame timestamp
  const uniqueAnnotatedFrames = Array.from(new Set(annotations.map((a) => a.frameTimestampMs)))
    .filter((ms) => ms <= currentTimeMs)
    .sort((a, b) => b - a); // descending

  const activeFrameMs = uniqueAnnotatedFrames[0] ?? null;
  const activeAnnotations = activeFrameMs !== null 
    ? getVisibleAnnotations(annotations, activeFrameMs)
    : [];

  // Setup player — reference clips are a plain MP4/WebM file (no HLS
  // manifest exists for them), recording clips are HLS-segmented.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (clip.clipType === 'reference') {
      video.src = playUrl;
      video.play().catch(() => {});
    } else if (Hls.isSupported()) {
      const hls = new Hls({ maxMaxBufferLength: 8, enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(playUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playUrl, clip.clipType]);

  // Video status event binds
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration || 0);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
    };
  }, []);

  // Draw overlay annotations — shares its actual painting with the live
  // replay popup (AnnotationCanvas.tsx) via annotation-drawing.ts, so a
  // shape looks pixel-identical wherever it's viewed. This component never
  // attempts jointRef resolution (no continuing pose data exists for a
  // saved clip — see the plan's "confirmed dead end" note) — it always
  // paints the fixed geometry baked in at annotation-save time.
  const drawOverlay = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!showAnnotations) return;

    for (const ann of activeAnnotations) {
      const color = ann.color || '#FF3B30';
      const width = ann.thickness || 3;

      if (ann.type === 'pen') {
        const pts = ann.geometry.points;
        if (pts && pts.length >= 2) {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(pts[0] * W, pts[1] * H);
          for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * W, pts[i + 1] * H);
          ctx.stroke();
        }
      } else if (ann.type === 'arrow' || ann.type === 'line') {
        const from = ann.geometry.from;
        const to = ann.geometry.to;
        if (from && to) {
          const fromPt = { x: from[0] * W, y: from[1] * H };
          const toPt = { x: to[0] * W, y: to[1] * H };
          if (ann.type === 'arrow') drawArrow(ctx, fromPt, toPt, color, width);
          else drawLine(ctx, fromPt, toPt, color, width);
        }
      } else if (ann.type === 'circle') {
        const c = { x: ann.geometry.cx * W, y: ann.geometry.cy * H };
        const r = (ann.geometry.r ?? 0.05) * Math.min(W, H);
        drawCircle(ctx, c, r, color, width);
      } else if (ann.type === 'angle') {
        const [ax, ay] = ann.geometry.a;
        const [vx, vy] = ann.geometry.vertex;
        const [bx, by] = ann.geometry.b;
        drawAngle(ctx, { x: ax * W, y: ay * H }, { x: vx * W, y: vy * H }, { x: bx * W, y: by * H }, color, width);
      } else if (ann.type === 'point') {
        drawPointMarker(ctx, { x: ann.geometry.x * W, y: ann.geometry.y * H }, color, width);
      } else if (ann.type === 'text') {
        if (ann.textContent) {
          drawTextLabel(ctx, { x: ann.geometry.x * W, y: ann.geometry.y * H }, ann.textContent, color);
        }
      }
    }
  };

  // Canvas is sized/positioned to the actual letterboxed video rect (see
  // useVideoOverlayRect) — not the full container, which the hardcoded
  // aspect-video wrapper below won't generally match — so normalized [0,1]
  // annotation coordinates map correctly for any clip resolution.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = overlayRect.width;
    canvas.height = overlayRect.height;
    drawOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayRect.width, overlayRect.height, activeAnnotations, showAnnotations]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) video.pause();
    else video.play().catch(() => {});
  };

  const changeSpeed = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const canReExport = isCoach && Boolean(clip.referenceVideoId);

  return (
    <div role="dialog" aria-modal="true" aria-label={clip.title} className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-md p-4">
      <div className="bg-panel border border-hairline rounded-lg w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-settle">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline bg-panel-2/50">
          <div>
            <h3 className="text-lg font-display font-semibold text-ink leading-snug">{clip.title}</h3>
            <p className="text-xs text-ink-faint mt-1 font-mono">
              Length: {formatTime((clip.endMs - clip.startMs) / 1000)} | Session:{' '}
              {clip.sessionId.substring(0, 8)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Download the processed AI video exactly as displayed (skeleton
                burned in). Only for reference/overlay clips — recording clips
                are HLS-segmented and have no single downloadable file. */}
            {clip.downloadable && (
              exportingMode ? (
                <button disabled className="px-3 py-2 rounded-full bg-panel-2 border border-hairline text-ink-muted text-xs font-semibold opacity-70 cursor-not-allowed inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Rendering {exportingMode === 'skeleton' ? 'skeleton' : 'annotations'}…
                </button>
              ) : canReExport && showModeChooser ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-ink-faint uppercase tracking-wide mr-0.5 hidden sm:inline">Download:</span>
                  <button
                    onClick={() => handleExportAndDownload(true)}
                    title="Burn in the full skeleton overlay"
                    className="px-3 py-2 rounded-full bg-session/15 hover:bg-session/25 border border-session/40 text-session text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                  >
                    <Bone className="w-3.5 h-3.5" /> Full skeleton
                  </button>
                  <button
                    onClick={() => handleExportAndDownload(false)}
                    title="Just the joint-attached annotations over the raw video"
                    className="px-3 py-2 rounded-full bg-panel-2 hover:bg-panel-2/60 border border-hairline text-ink-muted text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                  >
                    <PenLine className="w-3.5 h-3.5" /> Annotations only
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="px-3 py-2 rounded-full bg-brand hover:brightness-110 disabled:opacity-50 text-white dark:text-canvas text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                    title="Download this video"
                  >
                    <Download className="w-4 h-4" /> {downloading ? 'Preparing…' : 'Download'}
                  </button>
                  {canReExport && (
                    <button
                      onClick={() => setShowModeChooser(true)}
                      title="Choose full skeleton or annotations-only"
                      className="text-[10px] font-mono text-ink-faint hover:text-ink-muted underline decoration-dotted transition-colors hidden sm:inline"
                    >
                      other mode?
                    </button>
                  )}
                </>
              )
            )}
            <button
              onClick={onClose}
              aria-label="Close video player"
              className="p-2 rounded-full bg-panel-2 hover:bg-panel-2/60 border border-hairline text-ink-muted hover:text-ink transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Player + Canvas Box */}
        <div className="flex-1 min-h-0 bg-canvas flex items-center justify-center p-4">
          <div
            ref={containerRef}
            className="relative aspect-video w-full max-h-[60vh] rounded-lg overflow-hidden bg-panel-2 border border-hairline flex items-center justify-center group shadow-md"
          >
            <video
              ref={videoRef}
              playsInline
              className="w-full h-full object-contain"
            />
            {/* Annotation canvas overlay — sized/positioned to the actual
                letterboxed video rect, not the full container. */}
            <canvas
              ref={canvasRef}
              className="absolute pointer-events-none"
              style={{ left: overlayRect.left, top: overlayRect.top, width: overlayRect.width, height: overlayRect.height }}
            />

            {/* Play/Pause overlay toggle button */}
            {!isPlaying && (
              <button
                onClick={togglePlay}
                className="absolute p-5 rounded-full bg-panel/80 hover:bg-panel-2 border border-hairline hover:scale-105 backdrop-blur-glass text-ink transition-all cursor-pointer shadow-lg"
              >
                <Play className="w-7 h-7 fill-current" />
              </button>
            )}
          </div>
        </div>

        {/* Controls Panel */}
        <div className="bg-panel-2/60 border-t border-hairline px-6 py-4 flex flex-col gap-3">
          {/* Progress row */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-ink-faint">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (videoRef.current) videoRef.current.currentTime = val;
                setCurrentTime(val);
              }}
              className="flex-1 accent-brand bg-panel-2 h-1.5 rounded-full cursor-pointer"
            />
            <span className="text-xs font-mono text-ink-faint">{formatTime(duration)}</span>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <button
                onClick={togglePlay}
                className="bg-panel-2 hover:bg-panel-2/60 border border-hairline text-ink rounded-full px-4 py-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
              >
                {isPlaying ? (<><Pause className="w-3.5 h-3.5 fill-current" /> Pause</>) : (<><Play className="w-3.5 h-3.5 fill-current" /> Play</>)}
              </button>

              <button
                onClick={() => setShowAnnotations(!showAnnotations)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 border ${
                  showAnnotations
                    ? 'bg-brand text-white dark:text-canvas border-transparent'
                    : 'bg-panel-2 text-ink-muted hover:bg-panel-2/60 border-hairline'
                }`}
              >
                <Palette className="w-3.5 h-3.5" /> Annotations: {showAnnotations ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Speeds */}
            <div className="flex items-center gap-1 bg-panel p-1 rounded-full border border-hairline">
              {[0.5, 0.75, 1, 1.5].map((speed) => (
                <button
                  key={speed}
                  onClick={() => changeSpeed(speed)}
                  className={`px-3 py-1 rounded-full text-xs font-mono font-semibold transition-colors ${
                    playbackRate === speed
                      ? 'bg-brand text-white dark:text-canvas'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
