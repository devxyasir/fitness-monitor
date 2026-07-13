'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../../../../lib/socket-client';
import { AnnotationCanvas } from './AnnotationCanvas';
import { usePoseStore } from '../../../../stores/pose-store';
import { useReplayStore } from '../../../../stores/replay-store';
import type { PoseFrameDto } from '@replaycoach/types';
import { Rewind, Play, Pause, Circle, Loader2 } from 'lucide-react';

interface ReplayPanelProps {
  sessionId: string;
  isCoach: boolean;
  onReturnToLive: () => void;
  onEndReplay?: () => Promise<void>;
  selectedStudentIds?: string[];
  onSyncToStudents?: (timestampMs: number) => Promise<void>;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function ReplayPanel({
  sessionId,
  isCoach,
  onReturnToLive,
  onEndReplay,
  selectedStudentIds,
  onSyncToStudents,
}: ReplayPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  // Pose frames ring buffer for replay overlay — keyed by participantId → sorted PoseFrameDto[]
  const poseBufferRef = useRef<Map<string, PoseFrameDto[]>>(new Map());
  const [replayStartMs, setReplayStartMs] = useState<number | null>(null);

  // Fetch from the unified Zustand store
  const getReplayBlob = useReplayStore((s) => s.getReplayBlob);
  const participantId = useReplayStore((s) => s.participantId);
  const fromOffsetMs = useReplayStore((s) => s.currentTimestamp);

  // Collect pose frames into a ring buffer for replay
  useEffect(() => {
    const MAX_BUFFER_MS = 70_000;

    const handlePoseUpdate = (data: PoseFrameDto) => {
      if (data.sessionId !== sessionId) return;
      const pid = data.participantId;
      if (!poseBufferRef.current.has(pid)) {
        poseBufferRef.current.set(pid, []);
      }
      const arr = poseBufferRef.current.get(pid)!;
      arr.push(data);
      // Evict old frames
      const cutoff = Date.now() - MAX_BUFFER_MS;
      while (arr.length > 0 && arr[0]!.frameTimestampMs < cutoff) arr.shift();
    };

    socket.on('pose:update', handlePoseUpdate);
    return () => { socket.off('pose:update', handlePoseUpdate); };
  }, [sessionId]);

  const loadBlob = useCallback((blob: Blob) => {
    // Revoke previous URL
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;

    const video = videoRef.current;
    if (!video) return;
    video.src = url;
    video.playbackRate = playbackRate;
    video.play().catch(() => {});
  }, [playbackRate]);

  // Load the requested participant's buffer on mount or when participantId updates
  useEffect(() => {
    if (!getReplayBlob || !participantId) return;
    setLoadState('loading');

    const startOffset = fromOffsetMs ?? -30000;
    const blob = getReplayBlob(participantId, startOffset, 0);
    const wallStartMs = Date.now() + startOffset;
    setReplayStartMs(wallStartMs);

    if (!blob) {
      console.warn('[ReplayPanel] No buffer data available for', participantId);
      setLoadState('unavailable');
      return;
    }
    setLoadState('ready');
    loadBlob(blob);
  }, [getReplayBlob, participantId, fromOffsetMs, loadBlob]);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setReplayStartMs(null);
    };
  }, []);

  // Listen for sync seek from coach
  useEffect(() => {
    if (isCoach) return;

    const handleReplaySeek = (payload: { timestampMs: number }) => {
      const video = videoRef.current;
      if (video) {
        video.currentTime = payload.timestampMs / 1000;
      }
    };

    socket.on('replay:seek', handleReplaySeek);
    return () => {
      socket.off('replay:seek', handleReplaySeek);
    };
  }, [isCoach]);

  // Sync pose overlay to video currentTime during replay
  const { updateFrame } = usePoseStore();
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !replayStartMs) return;

    const syncPose = () => {
      const wallMs = replayStartMs + video.currentTime * 1000;
      for (const [pid, frames] of poseBufferRef.current.entries()) {
        // Find closest frame
        const closest = frames.reduce<PoseFrameDto | null>((best, f) => {
          if (!best) return f;
          return Math.abs(f.frameTimestampMs - wallMs) < Math.abs(best.frameTimestampMs - wallMs) ? f : best;
        }, null);
        if (closest) updateFrame(pid, closest);
      }
    };

    video.addEventListener('timeupdate', syncPose);
    return () => video.removeEventListener('timeupdate', syncPose);
  }, [replayStartMs, updateFrame]);

  const handleEndReplay = async () => {
    if (onEndReplay) await onEndReplay();
    else onReturnToLive();
  };

  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

  // Keyboard shortcuts: Space = play/pause, ←/→ = seek 5s, Esc = return to
  // live (coach only — a student has no independent exit, matching the
  // existing "coach controls when replay ends for everyone" design).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      const video = videoRef.current;
      if (!video) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (video.paused) video.play().catch(() => {}); else video.pause();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        video.currentTime = Math.min(duration || video.currentTime, video.currentTime + 5);
      } else if (e.key === 'Escape' && isCoach) {
        e.preventDefault();
        handleEndReplay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, isCoach]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-950 relative animate-rise">
      {/* Video player */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
      />

      {/* Loading / unavailable states — previously a blank black video with
          only a console.warn on failure, no feedback to the user at all. */}
      {loadState === 'loading' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-sm font-medium text-slate-300">Loading replay…</p>
        </div>
      )}
      {loadState === 'unavailable' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
          <Circle className="w-8 h-8 text-amber-500" />
          <p className="text-sm font-medium text-slate-300">No buffered footage available yet.</p>
          <p className="text-xs text-slate-500 max-w-xs">
            The rolling buffer needs a few seconds of video before it can replay — try again shortly.
          </p>
        </div>
      )}

      {/* Annotation canvas overlay (coach draws, students watch) */}
      <div className="absolute inset-0 z-10">
        <AnnotationCanvas
          sessionId={sessionId}
          frameTimestampMs={Math.round(currentTime * 1000)}
          isCoach={isCoach}
          {...(participantId ? { participantId } : {})}
        />
      </div>

      {/* Controls bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950/95 to-transparent px-4 pt-8 pb-4 z-20 flex flex-col gap-2">
        {/* Seek bar */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (videoRef.current) videoRef.current.currentTime = v;
            if (isCoach && onSyncToStudents) {
              onSyncToStudents(v * 1000).catch((err) =>
                console.error('[ReplayPanel] Failed to seek sync:', err),
              );
            }
          }}
          className="w-full accent-indigo-500 h-1.5 cursor-pointer"
        />

        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Play/Pause */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
              className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded-md transition font-semibold inline-flex items-center gap-1.5"
            >
              {isPlaying ? (<><Pause className="w-3.5 h-3.5 fill-current" /> Pause</>) : (<><Play className="w-3.5 h-3.5 fill-current" /> Play</>)}
            </button>

            <span className="text-slate-400 text-xs tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Speed selector */}
          <div className="flex items-center gap-1">
            {speeds.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setPlaybackRate(s);
                  if (videoRef.current) videoRef.current.playbackRate = s;
                }}
                className={`text-xs px-2 py-1 rounded transition ${
                  playbackRate === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>

          {/* Return to live */}
          {isCoach && (
            <button
              onClick={handleEndReplay}
              className="bg-green-700 hover:bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition inline-flex items-center gap-1.5"
            >
              <Rewind className="w-3.5 h-3.5" /> Return to Live
            </button>
          )}
        </div>
      </div>

      {/* DVR badge */}
      <div className="absolute top-3 left-3 z-20 bg-amber-600/90 text-white text-xs font-bold px-2.5 py-1 rounded-md shadow animate-pulse inline-flex items-center gap-1.5">
        <Circle className="w-2.5 h-2.5 fill-current" /> DVR PLAYBACK
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="absolute top-3 right-3 z-20 bg-slate-950/70 text-slate-400 text-[10px] font-mono px-2 py-1 rounded-md hidden sm:block">
        Space play/pause · ←→ seek 5s{isCoach ? ' · Esc return to live' : ''}
      </div>
    </div>
  );
}
