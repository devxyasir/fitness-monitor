'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import type { ClientAnnotation } from '../../../stores/annotation-store';
import { getVisibleAnnotations } from '../../../stores/annotation-store';
import { X, Play, Pause, Palette, Download } from 'lucide-react';
import { downloadClipVideo } from './downloadClip';

interface ClipPlaybackModalProps {
  clip: {
    id: string;
    title: string;
    startMs: number;
    endMs: number;
    sessionId: string;
    clipType?: 'recording' | 'reference';
    downloadable?: boolean;
    meeting?: { startedAt: string };
  };
  playUrl: string;
  annotations: ClientAnnotation[];
  onClose: () => void;
}

export function ClipPlaybackModal({ clip, playUrl, annotations, onClose }: ClipPlaybackModalProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      // Reuse the already-authorized playUrl the modal is streaming.
      await downloadClipVideo({ clipId: clip.id, startedAt: clip.meeting?.startedAt, playUrl });
    } catch (err) {
      console.error('[ClipPlaybackModal] Download failed:', err);
      alert('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

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

  // Draw overlay annotations
  const drawOverlay = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (!showAnnotations) return;

    for (const ann of activeAnnotations) {
      const color = ann.color || '#FF3B30';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      if (ann.type === 'pen') {
        const pts = ann.geometry.points;
        if (pts && pts.length >= 2) {
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(pts[0] * width, pts[1] * height);
          for (let i = 2; i < pts.length; i += 2) {
            ctx.lineTo(pts[i] * width, pts[i + 1] * height);
          }
          ctx.stroke();
        }
      } else if (ann.type === 'arrow') {
        const from = ann.geometry.from;
        const to = ann.geometry.to;
        if (from && to) {
          // Draw arrow segment
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(from[0] * width, from[1] * height);
          ctx.lineTo(to[0] * width, to[1] * height);
          ctx.stroke();

          // Draw head
          const angle = Math.atan2(to[1] * height - from[1] * height, to[0] * width - from[0] * width);
          ctx.beginPath();
          ctx.moveTo(to[0] * width, to[1] * height);
          ctx.lineTo(
            to[0] * width - 15 * Math.cos(angle - Math.PI / 6),
            to[1] * height - 15 * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            to[0] * width - 15 * Math.cos(angle + Math.PI / 6),
            to[1] * height - 15 * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        }
      } else if (ann.type === 'circle') {
        const cx = ann.geometry.cx * width;
        const cy = ann.geometry.cy * height;
        const r = ann.geometry.r * Math.min(width, height);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (ann.type === 'text') {
        const x = ann.geometry.x * width;
        const y = ann.geometry.y * height;
        if (ann.textContent) {
          ctx.font = 'bold 16px Inter, system-ui, sans-serif';
          ctx.fillText(ann.textContent, x, y);
        }
      }
    }
  };

  // Canvas size sync
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      drawOverlay();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeAnnotations, showAnnotations]);

  useEffect(() => {
    drawOverlay();
  }, [activeAnnotations, showAnnotations]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div>
            <h3 className="text-lg font-bold text-white leading-snug">{clip.title}</h3>
            <p className="text-xs text-slate-400 mt-1">
              Length: {formatTime((clip.endMs - clip.startMs) / 1000)} | Session:{' '}
              {clip.sessionId.substring(0, 8)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Download the processed AI video exactly as displayed (skeleton
                burned in). Only for reference/overlay clips — recording clips
                are HLS-segmented and have no single downloadable file. */}
            {clip.downloadable && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition inline-flex items-center gap-1.5"
                title="Download this video"
              >
                <Download className="w-4 h-4" /> {downloading ? 'Preparing…' : 'Download'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Player + Canvas Box */}
        <div className="flex-1 min-h-0 bg-slate-950 flex items-center justify-center p-4">
          <div
            ref={containerRef}
            className="relative aspect-video w-full max-h-[60vh] rounded-2xl overflow-hidden bg-slate-900 border border-slate-900 flex items-center justify-center group shadow-md"
          >
            <video
              ref={videoRef}
              playsInline
              className="w-full h-full object-contain"
            />
            {/* Annotation canvas overlay */}
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

            {/* Play/Pause overlay toggle button */}
            {!isPlaying && (
              <button
                onClick={togglePlay}
                className="absolute p-5 rounded-full bg-slate-950/80 hover:bg-slate-900 border border-slate-800 hover:scale-105 backdrop-blur-sm text-white transition cursor-pointer shadow-lg"
              >
                <Play className="w-7 h-7 fill-current" />
              </button>
            )}
          </div>
        </div>

        {/* Controls Panel */}
        <div className="bg-slate-900/90 border-t border-slate-800 px-6 py-4 flex flex-col gap-3">
          {/* Progress row */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-400">{formatTime(currentTime)}</span>
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
              className="flex-1 accent-indigo-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
            />
            <span className="text-xs font-mono text-slate-400">{formatTime(duration)}</span>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="bg-slate-800 hover:bg-slate-700 text-white rounded-xl px-4 py-2 text-xs font-semibold transition inline-flex items-center gap-1.5"
              >
                {isPlaying ? (<><Pause className="w-3.5 h-3.5 fill-current" /> Pause</>) : (<><Play className="w-3.5 h-3.5 fill-current" /> Play</>)}
              </button>

              <button
                onClick={() => setShowAnnotations(!showAnnotations)}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                  showAnnotations
                    ? 'bg-indigo-700 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Palette className="w-3.5 h-3.5" /> Annotations: {showAnnotations ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Speeds */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[0.5, 0.75, 1, 1.5].map((speed) => (
                <button
                  key={speed}
                  onClick={() => changeSpeed(speed)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    playbackRate === speed
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
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
