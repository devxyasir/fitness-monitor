'use client';

import { useEffect, useRef, useState } from 'react';
import { useAnnotationStore, ClientAnnotation, JointRef, getVisibleAnnotations, AnnotationTool } from '../../../../stores/annotation-store';
import { useAnnotationSocket } from '../hooks/useAnnotationSocket';
import { usePoseStore } from '../../../../stores/pose-store';
import { findNearestJoint, MIN_SCORE } from './skeletonGeometry';
import { useVideoOverlayRect } from '../../../../lib/hooks/useVideoOverlayRect';
import { drawLine, drawArrow, drawCircle, drawPointMarker, drawAngle, drawJointDot, drawTextLabel, type Pt } from '../../../../lib/annotation-drawing';
import type { PoseFrameDto } from '@replaycoach/types';
import {
  Pencil, ArrowRight, Minus, Circle, ChevronRight, MapPin, Type,
  Undo2, Redo2, Trash2, MousePointer2,
} from 'lucide-react';

interface AnnotationCanvasProps {
  sessionId: string;
  frameTimestampMs: number;
  isCoach: boolean;
  selectedStudentIds?: string[];
  /** Whose skeleton to snap shapes onto — the participant currently being
   * replayed. Omit to disable joint-snapping (pure pixel annotation). */
  participantId?: string;
  /** The replay `<video>` element this canvas overlays — needed to compute
   * the actual letterboxed video rect (see useVideoOverlayRect) rather than
   * sizing the canvas to the full container. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

const JOINT_SNAP_PX = 26;

// ----------------------------------------------------
// Ramer-Douglas-Peucker (RDP) Algorithm
// ----------------------------------------------------
function getSqSegDist(p: [number, number], p1: [number, number], p2: [number, number]): number {
  let x = p1[0];
  let y = p1[1];
  let dx = p2[0] - x;
  let dy = p2[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2[0];
      y = p2[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function rdpSimplify(points: [number, number][], sqTolerance: number): [number, number][] {
  const len = points.length;
  if (len <= 2) return points;

  let maxSqDist = 0;
  let index = 0;
  const end = len - 1;
  const p0 = points[0]!;
  const pEnd = points[end]!;

  for (let i = 1; i < end; i++) {
    const pCurrent = points[i]!;
    const sqDist = getSqSegDist(pCurrent, p0, pEnd);
    if (sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }

  if (maxSqDist > sqTolerance) {
    const results1 = rdpSimplify(points.slice(0, index + 1), sqTolerance);
    const results2 = rdpSimplify(points.slice(index), sqTolerance);
    return results1.slice(0, results1.length - 1).concat(results2);
  }

  return [p0, pEnd];
}

function simplifyFlatPoints(points: number[], tolerance = 0.003): number[] {
  if (points.length <= 4) return points;
  const pairs: [number, number][] = [];
  for (let i = 0; i < points.length; i += 2) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (p0 !== undefined && p1 !== undefined) {
      pairs.push([p0, p1]);
    }
  }
  const simplifiedPairs = rdpSimplify(pairs, tolerance * tolerance);
  const result: number[] = [];
  for (const p of simplifiedPairs) {
    result.push(p[0]!, p[1]!);
  }
  return result;
}

function jointsNeeded(tool: AnnotationTool): number {
  if (tool === 'point') return 1;
  if (tool === 'angle') return 3;
  if (tool === 'text') return 1;
  return 2; // pen handled separately (drag), arrow/line/circle need 2
}

// ----------------------------------------------------
// Main Component
// ----------------------------------------------------
export function AnnotationCanvas({
  sessionId,
  frameTimestampMs,
  isCoach,
  selectedStudentIds,
  participantId,
  videoRef,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRect = useVideoOverlayRect(containerRef, videoRef);

  const { activeTool, activeColor, activeThickness, annotations, selectedId, setActiveTool, setActiveColor, setActiveThickness, select } = useAnnotationStore();
  const { drawAnnotation, clearAnnotationLayer, deleteAnnotation, syncAnnotations } = useAnnotationSocket(sessionId);
  // This component is only ever rendered inside ReplayPanel (a replay
  // context) — read the `replay` slot, never `live`, so a joint-attached
  // shape's resolved position can't jump toward the live feed while a
  // historical replay is playing. If AnnotationCanvas is ever reused for a
  // genuinely live (non-replay) surface, this assumption needs revisiting.
  const poseFrame = usePoseStore((s) => (participantId ? s.replay[participantId] : undefined));

  // Drawing tracking (imperative refs — avoid React re-renders mid-gesture)
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<{ px: Pt; joint?: string } | null>(null);
  const currentPathPointsRef = useRef<number[]>([]);

  // Multi-click tools (angle needs 3 points; point needs 1)
  const [pendingPoints, setPendingPoints] = useState<{ px: Pt; joint?: string }[]>([]);
  const [mousePos, setMousePos] = useState<Pt | null>(null);
  const [hoveredJoint, setHoveredJoint] = useState<string | null>(null);

  // Local undo/redo history for this drawing session.
  const [localHistory, setLocalHistory] = useState<ClientAnnotation[]>([]);
  const [redoHistory, setRedoHistory] = useState<ClientAnnotation[]>([]);

  // Text tool overlay
  const [textInputPos, setTextInputPos] = useState<{ x: number; y: number } | null>(null);
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  const visibleAnnotations = getVisibleAnnotations(annotations, frameTimestampMs);

  // Pull the durably-persisted annotation history once, on open, so a
  // participant who joined/reconnected after shapes were already drawn
  // still sees them (previously nothing did this — see useAnnotationSocket).
  useEffect(() => {
    syncAnnotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const resolveJoint = (jointRef: JointRef | undefined, role: 'start' | 'mid' | 'end', fallback: [number, number] | undefined, W: number, H: number): Pt | null => {
    if (jointRef) {
      const name = role === 'start' ? jointRef.startJoint : role === 'mid' ? jointRef.midJoint : jointRef.endJoint;
      if (name && jointRef.participantId === participantId && poseFrame) {
        const kp = poseFrame.keypoints.find((k) => k.name === name);
        if (kp && kp.score >= MIN_SCORE) return { x: kp.x * W, y: kp.y * H };
        return null; // joint currently undetected/low-confidence — hide rather than show a stale/wrong spot
      }
    }
    if (fallback) return { x: fallback[0] * W, y: fallback[1] * H };
    return null;
  };

  const drawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    for (const ann of visibleAnnotations) {
      const color = ann.color || '#FF3B30';
      const width = ann.thickness || 3;
      const isSelected = ann.id === selectedId;
      const jointRef: JointRef | undefined = ann.geometry?.jointRef;

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
        const from = resolveJoint(jointRef, 'start', ann.geometry.from, W, H);
        const to = resolveJoint(jointRef, 'end', ann.geometry.to, W, H);
        if (from && to) {
          if (ann.type === 'arrow') drawArrow(ctx, from, to, color, width);
          else drawLine(ctx, from, to, color, width);
          if (jointRef) { drawJointDot(ctx, from); drawJointDot(ctx, to); }
        }
      } else if (ann.type === 'circle') {
        const c = resolveJoint(jointRef, 'start', [ann.geometry.cx, ann.geometry.cy], W, H);
        if (c) {
          const r = (ann.geometry.r ?? 0.05) * Math.min(W, H);
          drawCircle(ctx, c, r, color, width);
          if (jointRef) drawJointDot(ctx, c);
        }
      } else if (ann.type === 'angle') {
        const a = resolveJoint(jointRef, 'start', ann.geometry.a, W, H);
        const vertex = resolveJoint(jointRef, 'mid', ann.geometry.vertex, W, H);
        const b = resolveJoint(jointRef, 'end', ann.geometry.b, W, H);
        if (a && vertex && b) {
          drawAngle(ctx, a, vertex, b, color, width);
          if (jointRef) { drawJointDot(ctx, a); drawJointDot(ctx, vertex); drawJointDot(ctx, b); }
        }
      } else if (ann.type === 'point') {
        const p = resolveJoint(jointRef, 'start', [ann.geometry.x, ann.geometry.y], W, H);
        if (p) drawPointMarker(ctx, p, color, width);
      } else if (ann.type === 'text') {
        const x = ann.geometry.x * W;
        const y = ann.geometry.y * H;
        if (ann.textContent) {
          drawTextLabel(ctx, { x, y }, ann.textContent, color);
        }
      }

      if (isSelected) {
        ctx.save();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(2, 2, W - 4, H - 4);
        ctx.restore();
      }
    }
  };

  // Canvas is sized/positioned to the actual letterboxed video rect (see
  // useVideoOverlayRect) — not the full container — so normalized [0,1]
  // annotation coordinates map correctly even when the video's aspect
  // ratio doesn't match the container's. Reacts to overlayRect changes
  // (container resize, fullscreen toggle, video metadata load) via the
  // hook's own ResizeObserver, so no window-resize listener is needed here.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = overlayRect.width;
    canvas.height = overlayRect.height;
    drawAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayRect.width, overlayRect.height, annotations, frameTimestampMs, poseFrame, selectedId]);

  const snapPoint = (px: Pt): { px: Pt; joint?: string } => {
    const canvas = canvasRef.current;
    if (!canvas || !poseFrame) return { px };
    const nearest = findNearestJoint(poseFrame.keypoints, px.x, px.y, canvas.width, canvas.height, JOINT_SNAP_PX);
    if (!nearest) return { px };
    return { px: { x: nearest.x * canvas.width, y: nearest.y * canvas.height }, joint: nearest.name };
  };

  const toNorm = (px: Pt): [number, number] => {
    const canvas = canvasRef.current!;
    return [px.x / canvas.width, px.y / canvas.height];
  };

  const commit = (ann: ClientAnnotation) => {
    useAnnotationStore.getState().addAnnotation(ann);
    drawAnnotation(ann, selectedStudentIds);
    setLocalHistory((h) => [...h, ann]);
    setRedoHistory([]);
  };

  const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ann-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const nearestAnnotationAt = (px: Pt): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const W = canvas.width, H = canvas.height;
    let best: { id: string; d: number } | null = null;
    for (const ann of visibleAnnotations) {
      if (ann.type === 'pen' || ann.type === 'text' || ann.type === 'tombstone') continue;
      const jr: JointRef | undefined = ann.geometry?.jointRef;
      let d = Infinity;
      if (ann.type === 'point') {
        const p = resolveJoint(jr, 'start', [ann.geometry.x, ann.geometry.y], W, H);
        if (p) d = Math.hypot(p.x - px.x, p.y - px.y);
      } else if (ann.type === 'circle') {
        const c = resolveJoint(jr, 'start', [ann.geometry.cx, ann.geometry.cy], W, H);
        if (c) { const r = (ann.geometry.r ?? 0.05) * Math.min(W, H); d = Math.abs(Math.hypot(c.x - px.x, c.y - px.y) - r); }
      } else {
        const a = resolveJoint(jr, 'start', ann.geometry.from ?? ann.geometry.a, W, H);
        const b = resolveJoint(jr, ann.type === 'angle' ? 'mid' : 'end', ann.geometry.to ?? ann.geometry.vertex, W, H);
        if (a && b) {
          const t = Math.max(0, Math.min(1, ((px.x - a.x) * (b.x - a.x) + (px.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1)));
          d = Math.hypot(a.x + t * (b.x - a.x) - px.x, a.y + t * (b.y - a.y) - px.y);
        }
      }
      if (d <= 10 && (!best || d < best.d)) best = { id: ann.id, d };
    }
    return best?.id ?? null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isCoach) return;
    if (textInputPos) { commitTextAnnotation(); return; }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (activeTool === 'select') {
      select(nearestAnnotationAt(px));
      return;
    }

    const snapped = snapPoint(px);

    if (activeTool === 'point') {
      const ann: ClientAnnotation = {
        id: newId(), type: 'point', frameTimestampMs, color: activeColor, thickness: activeThickness,
        createdAt: new Date().toISOString(),
        persistUntilCleared: Boolean(snapped.joint),
        geometry: {
          x: toNorm(snapped.px)[0], y: toNorm(snapped.px)[1],
          ...(snapped.joint && participantId ? { jointRef: { participantId, startJoint: snapped.joint } } : {}),
        },
      };
      commit(ann);
      return;
    }

    if (activeTool === 'text') {
      setTextInputPos(px);
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    if (activeTool === 'angle') {
      const next = [...pendingPoints, snapped];
      if (next.length < jointsNeeded('angle')) { setPendingPoints(next); return; }
      const [a, vertex, b] = next;
      const hasJoint = !!(a!.joint || vertex!.joint || b!.joint) && !!participantId;
      const ann: ClientAnnotation = {
        id: newId(), type: 'angle', frameTimestampMs, color: activeColor, thickness: activeThickness,
        createdAt: new Date().toISOString(),
        persistUntilCleared: hasJoint,
        geometry: {
          a: toNorm(a!.px), vertex: toNorm(vertex!.px), b: toNorm(b!.px),
          ...(hasJoint ? { jointRef: { participantId, startJoint: a!.joint ?? 'left_shoulder', midJoint: vertex!.joint ?? 'left_elbow', endJoint: b!.joint ?? 'left_wrist' } } : {}),
        },
      };
      commit(ann);
      setPendingPoints([]);
      return;
    }

    // Drag-based tools: pen, arrow, line, circle
    isDrawingRef.current = true;
    startPointRef.current = snapped;
    if (activeTool === 'pen') currentPathPointsRef.current = [...toNorm(px)];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setMousePos(px);

    if (!isCoach) return;

    if (poseFrame && (activeTool !== 'pen' && activeTool !== 'text')) {
      const nearest = findNearestJoint(poseFrame.keypoints, px.x, px.y, canvas.width, canvas.height, JOINT_SNAP_PX);
      setHoveredJoint(nearest?.name ?? null);
    } else {
      setHoveredJoint(null);
    }

    if (!isDrawingRef.current || !startPointRef.current) {
      if (pendingPoints.length > 0) drawAll(); // keep pending-point preview fresh while hovering
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawAll();
    ctx.strokeStyle = activeColor;
    ctx.fillStyle = activeColor;

    if (activeTool === 'pen') {
      currentPathPointsRef.current.push(px.x / canvas.width, px.y / canvas.height);
      const pts = currentPathPointsRef.current;
      if (pts.length >= 2) {
        ctx.lineWidth = activeThickness;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0]! * canvas.width, pts[1]! * canvas.height);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]! * canvas.width, pts[i + 1]! * canvas.height);
        ctx.stroke();
      }
    } else if (activeTool === 'arrow') {
      drawArrow(ctx, startPointRef.current.px, px, activeColor, activeThickness);
    } else if (activeTool === 'line') {
      drawLine(ctx, startPointRef.current.px, px, activeColor, activeThickness);
    } else if (activeTool === 'circle') {
      const r = Math.hypot(px.x - startPointRef.current.px.x, px.y - startPointRef.current.px.y);
      drawCircle(ctx, startPointRef.current.px, r, activeColor, activeThickness);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isCoach || !isDrawingRef.current) return;
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    if (!canvas || !startPointRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const upPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const endSnapped = snapPoint(upPx);

    if (activeTool === 'pen') {
      const simplified = simplifyFlatPoints(currentPathPointsRef.current, 0.003);
      commit({
        id: newId(), type: 'pen', frameTimestampMs, color: activeColor, thickness: activeThickness,
        createdAt: new Date().toISOString(), geometry: { points: simplified },
      });
    } else if (activeTool === 'arrow' || activeTool === 'line') {
      const hasJoint = !!(startPointRef.current.joint || endSnapped.joint) && !!participantId;
      commit({
        id: newId(), type: activeTool, frameTimestampMs, color: activeColor, thickness: activeThickness,
        createdAt: new Date().toISOString(),
        persistUntilCleared: hasJoint,
        geometry: {
          from: toNorm(startPointRef.current.px), to: toNorm(endSnapped.px),
          ...(hasJoint ? { jointRef: { participantId, startJoint: startPointRef.current.joint ?? 'left_shoulder', endJoint: endSnapped.joint ?? 'left_wrist' } } : {}),
        },
      });
    } else if (activeTool === 'circle') {
      const rPx = Math.hypot(upPx.x - startPointRef.current.px.x, upPx.y - startPointRef.current.px.y);
      const hasJoint = !!startPointRef.current.joint && !!participantId;
      commit({
        id: newId(), type: 'circle', frameTimestampMs, color: activeColor, thickness: activeThickness,
        createdAt: new Date().toISOString(),
        persistUntilCleared: hasJoint,
        geometry: {
          cx: toNorm(startPointRef.current.px)[0], cy: toNorm(startPointRef.current.px)[1],
          r: rPx / Math.min(canvas.width, canvas.height),
          ...(hasJoint ? { jointRef: { participantId, startJoint: startPointRef.current.joint } } : {}),
        },
      });
    }

    startPointRef.current = null;
    currentPathPointsRef.current = [];
    drawAll();
  };

  const commitTextAnnotation = () => {
    if (!textInputPos || !textInputValue.trim()) {
      setTextInputPos(null); setTextInputValue('');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    commit({
      id: newId(), type: 'text', frameTimestampMs,
      geometry: { x: textInputPos.x / canvas.width, y: textInputPos.y / canvas.height },
      textContent: textInputValue.trim(), color: activeColor, thickness: activeThickness,
      createdAt: new Date().toISOString(),
    });
    setTextInputPos(null); setTextInputValue('');
  };

  const handleUndo = () => {
    if (!isCoach || localHistory.length === 0) return;
    const last = localHistory[localHistory.length - 1]!;
    setLocalHistory((h) => h.slice(0, -1));
    setRedoHistory((r) => [...r, last]);
    useAnnotationStore.getState().removeAnnotation(last.id);
    deleteAnnotation(last.id, selectedStudentIds);
  };

  const handleRedo = () => {
    if (!isCoach || redoHistory.length === 0) return;
    const last = redoHistory[redoHistory.length - 1]!;
    setRedoHistory((r) => r.slice(0, -1));
    setLocalHistory((h) => [...h, last]);
    useAnnotationStore.getState().addAnnotation(last);
    drawAnnotation(last, selectedStudentIds);
  };

  const handleDeleteSelected = () => {
    if (!isCoach || !selectedId) return;
    useAnnotationStore.getState().removeAnnotation(selectedId);
    deleteAnnotation(selectedId, selectedStudentIds);
    setLocalHistory((h) => h.filter((a) => a.id !== selectedId));
  };

  const handleClear = () => {
    if (!isCoach) return;
    useAnnotationStore.getState().clearAnnotations(frameTimestampMs);
    clearAnnotationLayer(frameTimestampMs, selectedStudentIds);
    setLocalHistory([]);
    setRedoHistory([]);
  };

  // Keyboard: Escape cancels an in-progress multi-click shape or text input.
  useEffect(() => {
    if (!isCoach) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement === textInputRef.current) return;
      if (e.key === 'Escape') { setPendingPoints([]); select(null); }
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) handleRedo(); else handleUndo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); handleDeleteSelected(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCoach, selectedId, localHistory, redoHistory]);

  const SHAPES: { id: AnnotationTool; label: string; icon: any }[] = [
    { id: 'pen', label: 'Pen', icon: Pencil },
    { id: 'line', label: 'Line', icon: Minus },
    { id: 'arrow', label: 'Arrow', icon: ArrowRight },
    { id: 'circle', label: 'Circle', icon: Circle },
    { id: 'angle', label: 'Angle', icon: ChevronRight },
    { id: 'point', label: 'Point', icon: MapPin },
    { id: 'text', label: 'Text', icon: Type },
  ];

  return (
    <div ref={containerRef} className="relative w-full h-full select-none bg-panel-2/10">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredJoint(null)}
        onPointerUp={handlePointerUp}
        className={`absolute block ${
          isCoach ? (activeTool === 'select' ? 'cursor-pointer' : 'cursor-crosshair') + ' touch-none' : 'pointer-events-none'
        }`}
        style={{ left: overlayRect.left, top: overlayRect.top, width: overlayRect.width, height: overlayRect.height }}
        aria-label="Annotation Drawing Panel"
      />

      {textInputPos && (
        <input
          ref={textInputRef}
          type="text"
          value={textInputValue}
          onChange={(e) => setTextInputValue(e.target.value)}
          onBlur={commitTextAnnotation}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTextAnnotation();
            if (e.key === 'Escape') { setTextInputPos(null); setTextInputValue(''); }
          }}
          style={{
            // textInputPos is canvas-local (relative to the letterboxed
            // video rect); this input is positioned relative to the
            // container, so overlayRect's offset must be added back in.
            position: 'absolute', left: overlayRect.left + textInputPos.x, top: overlayRect.top + textInputPos.y - 12,
            color: activeColor, font: 'bold 16px Inter, sans-serif',
            background: 'rgba(15, 21, 34, 0.92)', border: `1.5px solid ${activeColor}`,
            borderRadius: '8px', padding: '2px 6px', outline: 'none', zIndex: 30, width: '180px',
          }}
          placeholder="Type label..."
        />
      )}

      {/* Pending multi-click points (angle tool) — positioned to match the
          canvas's own rect exactly, since pendingPoints are stored in
          canvas-local pixel space (relative to the letterboxed video rect,
          not the container). */}
      {pendingPoints.length > 0 && (
        <svg
          className="absolute pointer-events-none z-20"
          style={{ left: overlayRect.left, top: overlayRect.top, width: overlayRect.width, height: overlayRect.height }}
        >
          {pendingPoints.map((p, i) => (
            <circle key={i} cx={p.px.x} cy={p.px.y} r={5} fill={activeColor} stroke="#0F1522" strokeWidth={1.5} />
          ))}
          {mousePos && (
            <line
              x1={pendingPoints[pendingPoints.length - 1]!.px.x}
              y1={pendingPoints[pendingPoints.length - 1]!.px.y}
              x2={mousePos.x} y2={mousePos.y}
              stroke={activeColor} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6}
            />
          )}
        </svg>
      )}

      {isCoach && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex flex-wrap items-center justify-center gap-3 bg-panel/70 hover:bg-panel/90 backdrop-blur-glass px-4 py-2.5 rounded-full border border-hairline shadow-2xl z-20 transition-colors max-w-[92vw]">
          <div className="flex items-center gap-1 border-r border-hairline pr-3">
            <button
              type="button"
              onClick={() => { setActiveTool('select'); setPendingPoints([]); }}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 ${
                activeTool === 'select' ? 'bg-session text-white dark:text-canvas shadow-md' : 'text-ink-muted hover:text-ink hover:bg-panel-2'
              }`}
              title="Select an existing shape"
            >
              <MousePointer2 className="w-3.5 h-3.5" />
            </button>
            {SHAPES.map((sh) => (
              <button
                key={sh.id}
                type="button"
                onClick={() => { setActiveTool(sh.id); setPendingPoints([]); setTextInputPos(null); }}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 ${
                  activeTool === sh.id ? 'bg-session text-white dark:text-canvas shadow-md' : 'text-ink-muted hover:text-ink hover:bg-panel-2'
                }`}
                title={sh.label}
              >
                <sh.icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 border-r border-hairline pr-3">
            {['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FFFFFF'].map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setActiveColor(color)}
                style={{ backgroundColor: color }}
                className={`w-5 h-5 rounded-full border-2 transition-colors ${
                  activeColor === color ? 'border-ink scale-110 shadow' : 'border-transparent hover:scale-105'
                }`}
                title={`Select color ${color}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5 border-r border-hairline pr-3">
            {[2, 3, 5, 8].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveThickness(t)}
                className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                  activeThickness === t ? 'bg-session' : 'hover:bg-panel-2'
                }`}
                title={`${t}px`}
              >
                <span className="rounded-full bg-ink" style={{ width: Math.min(t + 2, 10), height: Math.min(t + 2, 10) }} />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button type="button" onClick={handleUndo} disabled={localHistory.length === 0}
              className="px-2 py-1.5 text-xs text-ink-muted hover:text-ink font-medium rounded-lg hover:bg-panel-2 disabled:opacity-30 transition-colors inline-flex items-center gap-1"
              title="Undo (Ctrl+Z)">
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={handleRedo} disabled={redoHistory.length === 0}
              className="px-2 py-1.5 text-xs text-ink-muted hover:text-ink font-medium rounded-lg hover:bg-panel-2 disabled:opacity-30 transition-colors inline-flex items-center gap-1"
              title="Redo (Ctrl+Shift+Z)">
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={handleDeleteSelected} disabled={!selectedId}
              className="px-2 py-1.5 text-xs text-ink-muted hover:text-ink font-medium rounded-lg hover:bg-panel-2 disabled:opacity-30 transition-colors inline-flex items-center gap-1"
              title="Delete selected (Del)">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={handleClear}
              className="px-2.5 py-1.5 text-xs text-danger hover:text-danger font-semibold rounded-lg hover:bg-danger/10 transition-colors"
              title="Clear all marks on this frame">
              Clear
            </button>
          </div>
        </div>
      )}

      {isCoach && hoveredJoint && activeTool !== 'select' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-panel/90 backdrop-blur-glass border border-session/30 text-session text-[11px] font-mono px-2.5 py-1 rounded-full z-20">
          snap: {hoveredJoint}
        </div>
      )}
    </div>
  );
}
