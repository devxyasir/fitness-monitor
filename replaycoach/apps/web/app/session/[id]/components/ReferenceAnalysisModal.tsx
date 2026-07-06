'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParticipants } from '@livekit/components-react';
import { apiClient } from '../../../../lib/api-client';
import { useReferenceStore, type Stroke, type ReferenceTool } from '../../../../stores/reference-store';
import { useReferenceEmitters } from '../hooks/useReferenceSocket';
import { buildExtendedKeypoints, findNearestJoint, jointColor, jointRadius, SKELETON_SEGMENTS } from './skeletonGeometry';
import {
  Pencil,
  Minus,
  Square,
  Circle as CircleIcon,
  ArrowUpRight,
  X,
  Undo2,
  Trash2,
  Eye,
  EyeOff,
  Save,
  Play,
  Pause,
  StepBack,
  StepForward,
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
  const skeletonCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastEmitRef = useRef(0);

  const {
    refId, videoUrl, keypointsUrl, status, fps, frameCount,
    keypointsByFrame, showSkeleton, playing, frameIndex,
    strokesByFrame, activeTool, activeColor, activeWidth, targetStudentIds,
  } = useReferenceStore();
  const setKeypoints = useReferenceStore((s) => s.setKeypoints);
  const setFrameIndex = useReferenceStore((s) => s.setFrameIndex);
  const setPlaying = useReferenceStore((s) => s.setPlaying);
  const toggleSkeleton = useReferenceStore((s) => s.toggleSkeleton);
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
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const isDrawingRef = useRef(false);
  const startRef = useRef<[number, number] | null>(null);
  const pathRef = useRef<[number, number][]>([]);
  const snappedRef = useRef(false);

  const [clipTitle, setClipTitle] = useState('');
  const [savingClip, setSavingClip] = useState(false);
  const [savedClipMessage, setSavedClipMessage] = useState<string | null>(null);

  const handleSaveClip = async () => {
    if (!refId || !clipTitle.trim() || savingClip) return;
    setSavingClip(true);
    setSavedClipMessage(null);
    try {
      await apiClient.post(`/sessions/${sessionId}/reference/${refId}/save-clip`, {
        title: clipTitle.trim(),
        studentIds: targetStudentIds.length > 0 ? targetStudentIds : students.map((s) => s.identity),
        strokesByFrame,
      });
      setSavedClipMessage('Saved — visible in Clips for the selected students.');
      setClipTitle('');
    } catch (err) {
      console.error('[ReferenceAnalysisModal] Failed to save clip:', err);
      setSavedClipMessage('Failed to save clip. Please try again.');
    } finally {
      setSavingClip(false);
      setTimeout(() => setSavedClipMessage(null), 4000);
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

  // Resize observer for the draw/skeleton canvases
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDims({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Video <-> frameIndex sync
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const idx = Math.round(video.currentTime * fps);
    setFrameIndex(idx);

    if (isCoach) {
      const now = Date.now();
      if (now - lastEmitRef.current > 200) {
        lastEmitRef.current = now;
        emitState(!video.paused, idx);
      }
    }
  }, [fps, isCoach, emitState, setFrameIndex]);

  // Students: follow the coach's state
  useEffect(() => {
    if (isCoach) return;
    const video = videoRef.current;
    if (!video) return;
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
    if (video) video.currentTime = clamped / fps;
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
    if (isCoach) emitClose();
    close();
  };

  // ── Draw canvas: render committed strokes for the current frame ──────────
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, dims.width, dims.height);
    const strokes = strokesByFrame[frameIndex] ?? [];
    for (const s of strokes) drawStroke(ctx, s, dims.width, dims.height);
  }, [strokesByFrame, frameIndex, dims]);

  // ── Skeleton canvas: render keypoints for the current frame ──────────────
  useEffect(() => {
    const canvas = skeletonCanvasRef.current;
    if (!canvas) return;
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, dims.width, dims.height);
    if (!showSkeleton) return;

    const frame = keypointsByFrame[frameIndex];
    if (!frame) return;

    // Real detected points plus derived neck/spine/mid-hip points, for a
    // fuller, per-region-colored skeleton (see skeletonGeometry.ts).
    const extended = buildExtendedKeypoints(frame.keypoints);

    ctx.lineWidth = 2; // thin, precise lines rather than a thick blob
    ctx.lineCap = 'round';
    for (const seg of SKELETON_SEGMENTS) {
      const kpA = extended.get(seg.a);
      const kpB = extended.get(seg.b);
      if (!kpA || !kpB) continue;
      ctx.strokeStyle = seg.color;
      ctx.globalAlpha = Math.min(kpA.score, kpB.score);
      ctx.beginPath();
      ctx.moveTo(kpA.x * dims.width, kpA.y * dims.height);
      ctx.lineTo(kpB.x * dims.width, kpB.y * dims.height);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    for (const [name, kp] of extended) {
      const r = jointRadius(name);
      // White halo first so the colored dot reads clearly against any
      // background — and gives each joint a bigger, easier-to-click target.
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(kp.x * dims.width, kp.y * dims.height, r + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = jointColor(name);
      ctx.globalAlpha = kp.score;
      ctx.beginPath();
      ctx.arc(kp.x * dims.width, kp.y * dims.height, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }, [keypointsByFrame, frameIndex, dims, showSkeleton]);

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
    if ((activeTool === 'ellipse' || activeTool === 'line' || activeTool === 'arrow') && showSkeleton) {
      const frame = keypointsByFrame[frameIndex];
      if (frame) {
        const extended = buildExtendedKeypoints(frame.keypoints);
        const rect = drawCanvasRef.current!.getBoundingClientRect();
        const hit = findNearestJoint(
          extended,
          e.clientX - rect.left,
          e.clientY - rect.top,
          dims.width,
          dims.height,
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

    ctx.clearRect(0, 0, dims.width, dims.height);
    for (const s of strokesByFrame[frameIndex] ?? []) drawStroke(ctx, s, dims.width, dims.height);

    if (activeTool === 'freehand') {
      pathRef.current.push(cur);
      drawStroke(ctx, { tool: 'freehand', color: activeColor, width: activeWidth, points: pathRef.current }, dims.width, dims.height);
    } else {
      const centered = activeTool === 'ellipse' && snappedRef.current;
      drawStroke(ctx, { tool: activeTool, color: activeColor, width: activeWidth, from: startRef.current, to: cur, centered }, dims.width, dims.height);
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
      <div className="w-full max-w-6xl h-[85vh] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-900 bg-slate-900">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Reference Analysis</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800 text-emerald-400 uppercase tracking-wider inline-flex items-center gap-1">
              <CircleIcon className="w-2 h-2 fill-current" /> Synced to room
            </span>
            {status === 'processing' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/40 border border-amber-800 text-amber-400 uppercase tracking-wider animate-pulse">
                Analyzing…
              </span>
            )}
            {status === 'failed' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-950/40 border border-red-800 text-red-400 uppercase tracking-wider">
                Skeleton unavailable
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white leading-none px-2"
            aria-label="Close reference analysis"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: video + tools */}
        <div className="flex-1 flex min-h-0">
          <div ref={containerRef} className="flex-1 relative bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain"
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => isCoach && setPlaying(true)}
              onPause={() => isCoach && setPlaying(false)}
            />
            <canvas ref={skeletonCanvasRef} className="absolute inset-0 pointer-events-none" />
            <canvas
              ref={drawCanvasRef}
              className={`absolute inset-0 ${isCoach ? 'cursor-crosshair touch-none' : 'pointer-events-none'}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </div>

          {/* Draw tools side panel — coach only */}
          {isCoach && (
            <div className="w-56 border-l border-slate-900 bg-slate-900 p-4 flex flex-col gap-4 overflow-y-auto">
              {students.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Show To</span>
                    <span className="text-slate-600 normal-case font-medium">
                      {targetStudentIds.length === 0 ? 'Everyone' : `${targetStudentIds.length} selected`}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                    <label className="flex items-center gap-2 text-xs text-slate-300 px-1.5 py-1 rounded hover:bg-slate-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={targetStudentIds.length === 0}
                        onChange={() => setTargetStudentIds([])}
                        className="w-3.5 h-3.5 accent-amber-500"
                      />
                      All connected
                    </label>
                    {students.map((s) => (
                      <label
                        key={s.identity}
                        className="flex items-center gap-2 text-xs text-slate-300 px-1.5 py-1 rounded hover:bg-slate-900 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={targetStudentIds.includes(s.identity)}
                          onChange={() => toggleStudent(s.identity)}
                          className="w-3.5 h-3.5 accent-amber-500"
                        />
                        {s.name || s.identity}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tools</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {TOOLS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTool(t.id)}
                      title={t.label}
                      className={`aspect-square rounded-lg text-base flex items-center justify-center border transition ${
                        activeTool === t.id
                          ? 'bg-amber-600 border-amber-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <t.icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Color</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setActiveColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-6 h-6 rounded-full border-2 transition ${
                        activeColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Stroke Width</div>
                <div className="flex items-center gap-1.5">
                  {WIDTHS.map((w) => (
                    <button
                      key={w}
                      onClick={() => setActiveWidth(w)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        activeWidth === w
                          ? 'bg-amber-600 border-amber-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-900">
                <button onClick={handleUndo} className="text-xs text-left px-2 py-1.5 rounded-lg text-slate-300 hover:bg-slate-900 hover:text-white transition inline-flex items-center gap-1.5">
                  <Undo2 className="w-3.5 h-3.5" /> Undo
                </button>
                <button onClick={handleClear} className="text-xs text-left px-2 py-1.5 rounded-lg text-red-400 hover:bg-red-950/20 hover:text-red-300 transition inline-flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> Clear Frame
                </button>
                <button onClick={toggleSkeleton} className="text-xs text-left px-2 py-1.5 rounded-lg text-slate-300 hover:bg-slate-900 hover:text-white transition inline-flex items-center gap-1.5">
                  {showSkeleton ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} {showSkeleton ? 'Hide Skeleton' : 'Show Skeleton'}
                </button>
              </div>

              <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-900">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Save & Share</div>
                <input
                  type="text"
                  value={clipTitle}
                  onChange={(e) => setClipTitle(e.target.value)}
                  placeholder="Clip title…"
                  className="text-xs bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-600"
                />
                <button
                  onClick={handleSaveClip}
                  disabled={!clipTitle.trim() || savingClip}
                  className="text-xs font-semibold px-2 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition inline-flex items-center justify-center gap-1.5"
                >
                  {savingClip ? 'Saving…' : (<><Save className="w-3.5 h-3.5" /> Save Clip</>)}
                </button>
                {savedClipMessage && (
                  <div className="text-[10px] text-slate-400 leading-snug">{savedClipMessage}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Frame bar */}
        <div className="border-t border-slate-900 bg-slate-900 px-5 py-3 flex flex-col gap-2">
          <input
            type="range"
            min={0}
            max={Math.max(frameCount - 1, 0)}
            step={1}
            value={frameIndex}
            disabled={!isCoach}
            onChange={(e) => seekToFrame(parseInt(e.target.value, 10))}
            className="w-full accent-amber-500 h-1.5 cursor-pointer disabled:cursor-default disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                disabled={!isCoach}
                onClick={() => seekToFrame(frameIndex - 1)}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs px-2.5 py-1.5 rounded-md transition"
              >
                <StepBack className="w-3.5 h-3.5 fill-current" />
              </button>
              <button
                disabled={!isCoach}
                onClick={togglePlay}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition inline-flex items-center gap-1.5"
              >
                {playing ? (<><Pause className="w-3.5 h-3.5 fill-current" /> Pause</>) : (<><Play className="w-3.5 h-3.5 fill-current" /> Play</>)}
              </button>
              <button
                disabled={!isCoach}
                onClick={() => seekToFrame(frameIndex + 1)}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs px-2.5 py-1.5 rounded-md transition"
              >
                <StepForward className="w-3.5 h-3.5 fill-current" />
              </button>
              <span className="text-slate-400 text-xs font-mono tabular-nums ml-2">
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
                    className={`text-xs px-2 py-1 rounded transition ${
                      playbackRate === s ? 'bg-amber-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
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
