'use client';

import { useEffect, useRef, useState } from 'react';
import { useParticipants } from '@livekit/components-react';
import { apiClient } from '../../../../lib/api-client';
import { useReferenceStore, type Stroke, type ReferenceTool } from '../../../../stores/reference-store';
import { useReferenceEmitters } from '../hooks/useReferenceSocket';
import { findNearestJoint } from './skeletonGeometry';
import {
  Pencil,
  Minus,
  Square,
  Circle as CircleIcon,
  ArrowUpRight,
  X,
  Undo2,
  Trash2,
  Play,
  Pause,
  StepBack,
  StepForward,
  Loader2,
  Download,
  type LucideIcon,
} from 'lucide-react';

interface ReferenceAnalysisModalProps {
  sessionId: string;
  isCoach: boolean;
}

// Snap radius for "circle this joint" — generous enough to be forgiving with
// a mouse/trackpad, tight enough not to snap to the wrong nearby joint.
const JOINT_SNAP_PX = 16;

const TOOLS: { id: ReferenceTool; label: string; icon: LucideIcon }[] = [
  { id: 'freehand', label: 'Freehand', icon: Pencil },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: CircleIcon },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
];

const COLORS = ['#F59E0B', '#34D399', '#60A5FA', '#F87171', '#FFFFFF', '#A78BFA'];
const WIDTHS = [2, 4, 6];
const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return '00:00.0';
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'freehand' && stroke.points && stroke.points.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(stroke.points[0]![0] * width, stroke.points[0]![1] * height);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i]![0] * width, stroke.points[i]![1] * height);
    }
    ctx.stroke();
    return;
  }

  if (!stroke.from || !stroke.to) return;
  const fx = stroke.from[0] * width;
  const fy = stroke.from[1] * height;
  const tx = stroke.to[0] * width;
  const ty = stroke.to[1] * height;

  if (stroke.tool === 'line') {
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  } else if (stroke.tool === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    const angle = Math.atan2(ty - fy, tx - fx);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - 15 * Math.cos(angle - Math.PI / 6), ty - 15 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tx - 15 * Math.cos(angle + Math.PI / 6), ty - 15 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  } else if (stroke.tool === 'rect') {
    ctx.strokeRect(Math.min(fx, tx), Math.min(fy, ty), Math.abs(tx - fx), Math.abs(ty - fy));
  } else if (stroke.tool === 'ellipse') {
    let cx: number, cy: number, rx: number, ry: number;
    if (stroke.centered) {
      // Snapped onto a joint: `from` is the joint itself (the center);
      // the drag distance to `to` sets the radius, so the circle actually
      // encloses the joint instead of using it as a bounding-box corner.
      cx = fx;
      cy = fy;
      const r = Math.hypot(tx - fx, ty - fy);
      rx = r;
      ry = r;
    } else {
      cx = (fx + tx) / 2;
      cy = (fy + ty) / 2;
      rx = Math.abs(tx - fx) / 2;
      ry = Math.abs(ty - fy) / 2;
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function ReferenceAnalysisModal({ sessionId, isCoach }: ReferenceAnalysisModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastEmitRef = useRef(0);

  const {
    refId, videoUrl, overlayVideoUrl, keypointsUrl, status, fps, frameCount,
    keypointsByFrame, playing, frameIndex,
    strokesByFrame, activeTool, activeColor, activeWidth, targetStudentIds,
  } = useReferenceStore();
  const setKeypoints = useReferenceStore((s) => s.setKeypoints);
  const setFrameIndex = useReferenceStore((s) => s.setFrameIndex);
  const setPlaying = useReferenceStore((s) => s.setPlaying);
  const setActiveTool = useReferenceStore((s) => s.setActiveTool);
  const setActiveColor = useReferenceStore((s) => s.setActiveColor);
  const setActiveWidth = useReferenceStore((s) => s.setActiveWidth);
  const addStroke = useReferenceStore((s) => s.addStroke);
  const undoFrame = useReferenceStore((s) => s.undoFrame);
  const clearFrame = useReferenceStore((s) => s.clearFrame);
  const close = useReferenceStore((s) => s.close);
  const setTargetStudentIds = useReferenceStore((s) => s.setTargetStudentIds);

  const { emitState, emitAnnotate, emitUndo, emitClear, emitClose } = useReferenceEmitters(sessionId, isCoach);

  // Audience picker — same "empty = everyone" targeting model as annotations/replay.
  const participants = useParticipants();
  const students = isCoach ? participants.filter((p) => !p.isLocal) : [];
  const toggleStudent = (identity: string) => {
    setTargetStudentIds(
      targetStudentIds.includes(identity)
        ? targetStudentIds.filter((id) => id !== identity)
        : [...targetStudentIds, identity],
    );
  };

  const [playbackRate, setPlaybackRate] = useState(1);
  // Raw container box (from ResizeObserver) and the video's own intrinsic
  // pixel size — combined below into videoRect, the actual rendered content
  // box. The <video> uses object-contain, which letterboxes/pillarboxes to
  // preserve aspect ratio, so the visible video is very often SMALLER than
  // the container (e.g. a portrait 1080x1920 clip inside a wide modal gets
  // large black bars on both sides). The skeleton/draw canvases must be
  // sized and positioned to that actual visible box, not the full
  // container — otherwise a keypoint at normalized x=0.1 (near the video's
  // real left edge) gets multiplied by the full container width instead of
  // the much narrower visible video width, landing out in the black-bar
  // area. That's what "checkpoints too wide, not fitting the body" actually
  // was — a canvas-positioning bug, not a detection-quality issue.
  const [containerDims, setContainerDims] = useState({ width: 0, height: 0 });
  const [videoIntrinsic, setVideoIntrinsic] = useState({ width: 0, height: 0 });
  const isDrawingRef = useRef(false);
  const startRef = useRef<[number, number] | null>(null);
  const pathRef = useRef<[number, number][]>([]);
  const snappedRef = useRef(false);
  const syncedRef = useRef(false);

  // Every analyzed video is auto-saved as a shared Clip the moment analysis
  // completes (see ReferenceService.completeProcessing on the backend) —
  // there's no manual save step. This just carries forward whatever the
  // coach drew into that already-created clip, fired on close so it isn't
  // lost, without blocking the modal from closing immediately. The backend
  // appends rather than replaces (this modal always starts with an empty
  // strokesByFrame, even when re-presenting a video drawn on earlier), so
  // the guard here only prevents this one session's strokes from being
  // double-submitted if close fires more than once (e.g. a rapid double-click).
  const syncAnnotations = () => {
    if (!refId || !isCoach || syncedRef.current || Object.keys(strokesByFrame).length === 0) return;
    syncedRef.current = true;
    apiClient
      .post(`/sessions/${sessionId}/reference/${refId}/sync-annotations`, { strokesByFrame })
      .catch((err) => console.error('[ReferenceAnalysisModal] Failed to sync annotations:', err));
  };

  // Download the analyzed video exactly as shown (skeleton burned in). The
  // same MP4 the modal is playing (overlayVideoUrl, or the raw video if
  // overlay generation failed). Available to coach and students alike.
  const [downloadingVideo, setDownloadingVideo] = useState(false);
  const handleDownloadVideo = async () => {
    const url = overlayVideoUrl ?? videoUrl;
    if (!url || downloadingVideo) return;
    setDownloadingVideo(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `replay-${new Date().toISOString().slice(0, 10)}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('[ReferenceAnalysisModal] Video download failed:', err);
      alert('Download failed. Please try again.');
    } finally {
      setDownloadingVideo(false);
    }
  };

  // Fetch keypoints JSON once ready
  useEffect(() => {
    if (status !== 'ready' || !keypointsUrl) return;
    let cancelled = false;
    fetch(keypointsUrl)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setKeypoints(data);
      })
      .catch((err) => console.error('[ReferenceAnalysisModal] Failed to load keypoints:', err));
    return () => {
      cancelled = true;
    };
  }, [status, keypointsUrl, setKeypoints]);

  // Resize observer for the outer container (not yet the visible video box —
  // see videoRect below, which accounts for object-contain letterboxing).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerDims({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The actual on-screen box the video occupies inside the container, given
  // object-contain letterboxing — this is what the canvases must match
  // (both size and position) for keypoint coordinates to land correctly.
  // Falls back to the full container before video metadata has loaded.
  const videoRect = (() => {
    const { width: cw, height: ch } = containerDims;
    const { width: vw, height: vh } = videoIntrinsic;
    if (!vw || !vh || !cw || !ch) {
      return { width: cw, height: ch, left: 0, top: 0 };
    }
    const containerAspect = cw / ch;
    const videoAspect = vw / vh;
    let width: number, height: number;
    if (containerAspect > videoAspect) {
      height = ch;
      width = height * videoAspect;
    } else {
      width = cw;
      height = width / videoAspect;
    }
    return { width, height, left: (cw - width) / 2, top: (ch - height) / 2 };
  })();

  // Video <-> frameIndex sync — driven by requestAnimationFrame rather than
  // the native `timeupdate` event, which only fires a handful of times per
  // second and made the skeleton overlay visibly lag behind the video.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let rafId: number;

    const tick = () => {
      const idx = Math.round(video.currentTime * fps);
      if (idx !== useReferenceStore.getState().frameIndex) {
        setFrameIndex(idx);
      }

      if (isCoach) {
        const now = Date.now();
        if (now - lastEmitRef.current > 200) {
          lastEmitRef.current = now;
          emitState(!video.paused, idx);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [fps, isCoach, emitState, setFrameIndex]);

  // Students: follow the coach's state
  useEffect(() => {
    if (isCoach) return;
    const video = videoRef.current;
    if (!video || !(fps > 0)) return;
    const targetTime = frameIndex / fps;
    if (Math.abs(video.currentTime - targetTime) > 0.15) {
      video.currentTime = targetTime;
    }
    if (playing && video.paused) video.play().catch(() => {});
    if (!playing && !video.paused) video.pause();
  }, [isCoach, playing, frameIndex, fps]);

  const seekToFrame = (idx: number) => {
    const clamped = Math.max(0, Math.min(frameCount > 0 ? frameCount - 1 : idx, idx));
    setFrameIndex(clamped);
    const video = videoRef.current;
    // fps is 0/null until analysis finishes — assigning currentTime = Infinity
    // throws a DOMException, which is exactly the "seeking gives an error"
    // report when scrubbing while the video is still processing.
    if (video && fps > 0) video.currentTime = clamped / fps;
    if (isCoach) emitState(!video?.paused, clamped);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    if (isCoach) emitState(video.paused, Math.round(video.currentTime * fps));
  };

  const handleClose = () => {
    if (isCoach) {
      syncAnnotations();
      emitClose();
    }
    close();
  };

  // Resizing a canvas (even to the same value) resets its 2D context, so
  // this must be its own effect keyed only on `dims` — not re-run on every
  // frameIndex/keypoints change, which would otherwise happen many times a
  // second and was a source of the rendering lag.
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (canvas) {
      canvas.width = videoRect.width;
      canvas.height = videoRect.height;
    }
  }, [containerDims, videoIntrinsic]);

  // ── Draw canvas: render committed strokes for the current frame ──────────
  // The skeleton itself is no longer drawn here — it's burned directly onto
  // the video's own pixels by the pose-service (see reference_processor.py),
  // so this canvas only ever holds the coach's own pen/arrow/circle marks.
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, videoRect.width, videoRect.height);
    const strokes = strokesByFrame[frameIndex] ?? [];
    for (const s of strokes) drawStroke(ctx, s, videoRect.width, videoRect.height);
  }, [strokesByFrame, frameIndex, containerDims, videoIntrinsic]);

  // ── Drawing interaction (coach only) ──────────────────────────────────────
  const toNorm = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = drawCanvasRef.current!.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isCoach) return;
    isDrawingRef.current = true;
    let start = toNorm(e);
    snappedRef.current = false;

    // Snap the anchor onto a detected joint when starting near one — lets
    // the coach precisely circle/point-at a specific joint instead of
    // eyeballing it. Ellipse snaps become a circle centered on the joint;
    // line/arrow snap their start point onto it.
    if (activeTool === 'ellipse' || activeTool === 'line' || activeTool === 'arrow') {
      const frame = keypointsByFrame[frameIndex];
      if (frame) {
        const rect = drawCanvasRef.current!.getBoundingClientRect();
        const hit = findNearestJoint(
          frame.keypoints,
          e.clientX - rect.left,
          e.clientY - rect.top,
          videoRect.width,
          videoRect.height,
          JOINT_SNAP_PX,
        );
        if (hit) {
          start = [hit.x, hit.y];
          snappedRef.current = true;
        }
      }
    }

    startRef.current = start;
    pathRef.current = [start];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isCoach || !isDrawingRef.current || !startRef.current) return;
    const cur = toNorm(e);
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, videoRect.width, videoRect.height);
    for (const s of strokesByFrame[frameIndex] ?? []) drawStroke(ctx, s, videoRect.width, videoRect.height);

    if (activeTool === 'freehand') {
      pathRef.current.push(cur);
      drawStroke(ctx, { tool: 'freehand', color: activeColor, width: activeWidth, points: pathRef.current }, videoRect.width, videoRect.height);
    } else {
      const centered = activeTool === 'ellipse' && snappedRef.current;
      drawStroke(ctx, { tool: activeTool, color: activeColor, width: activeWidth, from: startRef.current, to: cur, centered }, videoRect.width, videoRect.height);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isCoach || !isDrawingRef.current || !startRef.current) return;
    isDrawingRef.current = false;
    const cur = toNorm(e);

    const stroke: Stroke =
      activeTool === 'freehand'
        ? { tool: 'freehand', color: activeColor, width: activeWidth, points: pathRef.current }
        : {
            tool: activeTool,
            color: activeColor,
            width: activeWidth,
            from: startRef.current,
            to: cur,
            centered: activeTool === 'ellipse' && snappedRef.current,
          };

    addStroke(frameIndex, stroke);
    emitAnnotate(frameIndex, stroke);
    startRef.current = null;
    pathRef.current = [];
    snappedRef.current = false;
  };

  const handleUndo = () => {
    undoFrame(frameIndex);
    emitUndo(frameIndex);
  };
  const handleClear = () => {
    clearFrame(frameIndex);
    emitClear(frameIndex);
  };

  if (!refId || !videoUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl h-[85vh] bg-panel border border-hairline rounded-lg shadow-2xl flex flex-col overflow-hidden animate-settle">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-panel-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-display font-bold text-ink uppercase tracking-wide">Reference Analysis</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-live/10 border border-live/30 text-live uppercase tracking-wider inline-flex items-center gap-1">
              <CircleIcon className="w-2 h-2 fill-current" /> Synced to room
            </span>
            {status === 'processing' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-replay/10 border border-replay/30 text-replay uppercase tracking-wider animate-pulse">
                Analyzing…
              </span>
            )}
            {status === 'failed' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-danger/10 border border-danger/30 text-danger uppercase tracking-wider">
                Skeleton unavailable
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Download the analyzed video (skeleton burned in) — available to
                coach and students once analysis has produced a video. */}
            {status === 'ready' && (overlayVideoUrl || videoUrl) && (
              <button
                onClick={handleDownloadVideo}
                disabled={downloadingVideo}
                className="px-3 py-1.5 rounded-full bg-gradient-to-r from-brand-indigo to-brand-violet hover:shadow-glow disabled:opacity-50 text-canvas text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                title="Download this video"
              >
                <Download className="w-3.5 h-3.5" /> {downloadingVideo ? 'Preparing…' : 'Download'}
              </button>
            )}
            {/* Students can't dismiss this — it stays synced to whatever the
                coach is presenting until the coach closes it. */}
            {isCoach && (
              <button
                onClick={handleClose}
                className="text-ink-faint hover:text-ink leading-none px-2 transition-colors"
                aria-label="Close reference analysis"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Body: video + tools — stacked on mobile so the video keeps most
            of the screen instead of being squeezed beside a fixed sidebar */}
        <div className="flex-1 flex flex-col sm:flex-row min-h-0">
          <div ref={containerRef} className="flex-1 relative bg-black">
            {/* Once analysis finishes, this plays the skeleton-burned-in
                video the pose-service produced instead of the raw upload —
                see reference_processor.py. Falls back to the raw video if
                overlay generation/upload failed (non-fatal). */}
            <video
              ref={videoRef}
              src={overlayVideoUrl ?? videoUrl}
              className="w-full h-full object-contain"
              playsInline
              onLoadedMetadata={() => {
                const v = videoRef.current;
                if (v) setVideoIntrinsic({ width: v.videoWidth, height: v.videoHeight });
              }}
              onPlay={() => isCoach && setPlaying(true)}
              onPause={() => isCoach && setPlaying(false)}
            />
            {/* Positioned/sized to videoRect, not the full container — the
                video is letterboxed by object-contain, so its actual visible
                box is very often smaller than the container. Coach's own
                pen/arrow/circle drawings only — the skeleton itself is
                already part of the video's pixels above. */}
            <canvas
              ref={drawCanvasRef}
              className={`absolute ${isCoach ? 'cursor-crosshair touch-none' : 'pointer-events-none'}`}
              style={{ left: videoRect.left, top: videoRect.top, width: videoRect.width, height: videoRect.height }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
            {/* Covers the raw video until pose detection finishes — the video
                still loads/buffers underneath so it's ready to reveal
                instantly, but nobody sees it un-analyzed. A failed analysis
                still reveals the raw video (just without a skeleton) rather
                than blocking the feature entirely. */}
            {status === 'processing' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-canvas">
                <Loader2 className="w-8 h-8 text-replay animate-spin" />
                <p className="text-sm font-semibold text-ink-muted">Analyzing video…</p>
                <p className="text-xs text-ink-faint">The video will appear once pose detection finishes.</p>
              </div>
            )}
          </div>

          {/* Draw tools side panel — coach only. Below the video (capped
              height, scrollable) on mobile; a fixed-width sidebar from sm+ */}
          {isCoach && (
            <div className="w-full sm:w-56 max-h-[35vh] sm:max-h-none border-t sm:border-t-0 sm:border-l border-hairline bg-panel-2 p-4 flex flex-col gap-4 overflow-y-auto">
              {students.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-ink-faint uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Show To</span>
                    <span className="text-ink-faint normal-case font-medium">
                      {targetStudentIds.length === 0 ? 'Everyone' : `${targetStudentIds.length} selected`}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                    <label className="flex items-center gap-2 text-xs text-ink-muted px-1.5 py-1 rounded-md hover:bg-panel cursor-pointer">
                      <input
                        type="checkbox"
                        checked={targetStudentIds.length === 0}
                        onChange={() => setTargetStudentIds([])}
                        className="w-3.5 h-3.5 accent-brand-indigo"
                      />
                      All connected
                    </label>
                    {students.map((s) => (
                      <label
                        key={s.identity}
                        className="flex items-center gap-2 text-xs text-ink-muted px-1.5 py-1 rounded-md hover:bg-panel cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={targetStudentIds.includes(s.identity)}
                          onChange={() => toggleStudent(s.identity)}
                          className="w-3.5 h-3.5 accent-brand-indigo"
                        />
                        {s.name || s.identity}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10px] font-bold text-ink-faint uppercase tracking-wider mb-2">Tools</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {TOOLS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTool(t.id)}
                      title={t.label}
                      className={`aspect-square rounded-lg text-base flex items-center justify-center border transition-colors ${
                        activeTool === t.id
                          ? 'bg-gradient-to-r from-brand-indigo to-brand-violet border-transparent text-canvas'
                          : 'bg-panel border-hairline text-ink-muted hover:text-ink hover:border-hairline'
                      }`}
                    >
                      <t.icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-ink-faint uppercase tracking-wider mb-2">Color</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setActiveColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-6 h-6 rounded-full border-2 transition-colors ${
                        activeColor === c ? 'border-ink scale-110' : 'border-transparent hover:scale-105'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-ink-faint uppercase tracking-wider mb-2">Stroke Width</div>
                <div className="flex items-center gap-1.5">
                  {WIDTHS.map((w) => (
                    <button
                      key={w}
                      onClick={() => setActiveWidth(w)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        activeWidth === w
                          ? 'bg-gradient-to-r from-brand-indigo to-brand-violet border-transparent text-canvas'
                          : 'bg-panel border-hairline text-ink-muted hover:text-ink'
                      }`}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 pt-2 border-t border-hairline">
                <button onClick={handleUndo} className="text-xs text-left px-2 py-1.5 rounded-lg text-ink-muted hover:bg-panel hover:text-ink transition-colors inline-flex items-center gap-1.5">
                  <Undo2 className="w-3.5 h-3.5" /> Undo
                </button>
                <button onClick={handleClear} className="text-xs text-left px-2 py-1.5 rounded-lg text-danger hover:bg-danger/10 hover:text-danger transition-colors inline-flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> Clear Frame
                </button>
              </div>

              <div className="pt-2 border-t border-hairline text-[10px] text-ink-faint leading-snug">
                Automatically saved and shared with students in this session once analysis finishes.
              </div>
            </div>
          )}
        </div>

        {/* Frame bar — playback controls are coach-only; students just watch
            in sync with whatever the coach does. */}
        <div className="border-t border-hairline bg-panel-2 px-5 py-3 flex flex-col gap-2">
          {isCoach && (
            <input
              type="range"
              min={0}
              max={Math.max(frameCount - 1, 0)}
              step={1}
              value={frameIndex}
              onChange={(e) => seekToFrame(parseInt(e.target.value, 10))}
              className="w-full accent-brand-indigo h-1.5 cursor-pointer"
            />
          )}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              {isCoach && (
                <>
                  <button
                    onClick={() => seekToFrame(frameIndex - 1)}
                    className="bg-panel hover:bg-panel/70 border border-hairline disabled:opacity-40 text-ink text-xs px-2.5 py-1.5 rounded-full transition-colors"
                  >
                    <StepBack className="w-3.5 h-3.5 fill-current" />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="bg-gradient-to-r from-brand-indigo to-brand-violet hover:shadow-glow disabled:opacity-40 text-canvas text-xs font-semibold px-3 py-1.5 rounded-full transition-colors inline-flex items-center gap-1.5"
                  >
                    {playing ? (<><Pause className="w-3.5 h-3.5 fill-current" /> Pause</>) : (<><Play className="w-3.5 h-3.5 fill-current" /> Play</>)}
                  </button>
                  <button
                    onClick={() => seekToFrame(frameIndex + 1)}
                    className="bg-panel hover:bg-panel/70 border border-hairline disabled:opacity-40 text-ink text-xs px-2.5 py-1.5 rounded-full transition-colors"
                  >
                    <StepForward className="w-3.5 h-3.5 fill-current" />
                  </button>
                </>
              )}
              <span className="text-ink-muted text-xs font-mono tabular-nums ml-2">
                {formatTime(frameIndex / fps)} / {formatTime(frameCount / fps)} · f{frameIndex}
              </span>
            </div>

            {isCoach && (
              <div className="flex items-center gap-1">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setPlaybackRate(s);
                      if (videoRef.current) videoRef.current.playbackRate = s;
                    }}
                    className={`text-xs font-mono px-2 py-1 rounded-full transition-colors ${
                      playbackRate === s ? 'bg-gradient-to-r from-brand-indigo to-brand-violet text-canvas' : 'bg-panel hover:bg-panel/70 border border-hairline text-ink-muted'
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
