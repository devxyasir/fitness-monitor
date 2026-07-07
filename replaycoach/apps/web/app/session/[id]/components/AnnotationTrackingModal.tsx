'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../../lib/api-client';
import { useAnnotationTrackingStore, type KeypointFrame } from '../../../../stores/annotation-tracking-store';
import { skeletonConnectionsFor, keypointNamesFor, type TrackedAnnotation, type TrackedAnnotationShape } from '@replaycoach/types';
import {
  X, Play, Pause, StepBack, StepForward, Loader2, Download,
  Minus, ArrowUpRight, Circle as CircleIcon, Trash2, Undo2, Redo2, Eye, EyeOff, MousePointer2,
  ChevronRight,
} from 'lucide-react';

interface Props {
  sessionId: string;
  isCoach: boolean;
}

const COLORS = ['#EF4444', '#F59E0B', '#34D399', '#60A5FA', '#A78BFA', '#FFFFFF'];
const THICKNESSES = [2, 4, 6];
const SHAPES: { id: TrackedAnnotationShape; label: string; icon: any }[] = [
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'circle', label: 'Circle', icon: CircleIcon },
  { id: 'angle', label: 'Angle', icon: ChevronRight },
  { id: 'point', label: 'Point', icon: CircleIcon },
];
const JOINT_SNAP_PX = 22;
const MIN_SCORE = 0.3;

function jointsNeeded(shape: TrackedAnnotationShape): number {
  return shape === 'point' ? 1 : shape === 'angle' ? 3 : 2;
}

export function AnnotationTrackingModal({ sessionId, isCoach }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const skeletonCanvasRef = useRef<HTMLCanvasElement>(null);
  const annCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const s = useAnnotationTrackingStore();
  const {
    refId, videoUrl, keypointsUrl, exportVideoUrl, keypointFormat, status, fps, frameCount,
    keypointsByFrame, annotations, selectedId, shapeType, color, thickness, showSkeleton,
    pendingJoints, playing, frameIndex,
  } = s;

  const [containerDims, setContainerDims] = useState({ width: 0, height: 0 });
  const [videoIntrinsic, setVideoIntrinsic] = useState({ width: 0, height: 0 });
  const [exporting, setExporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hoveredJoint, setHoveredJoint] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Actual on-screen video box (object-contain letterboxing) — canvases and
  // joint hit-testing must use this, not the raw container, or coordinates
  // land in the black bars.
  const videoRect = (() => {
    const { width: cw, height: ch } = containerDims;
    const { width: vw, height: vh } = videoIntrinsic;
    if (!vw || !vh || !cw || !ch) return { width: cw, height: ch, left: 0, top: 0 };
    const ca = cw / ch, va = vw / vh;
    let w: number, h: number;
    if (ca > va) { h = ch; w = h * va; } else { w = cw; h = w / va; }
    return { width: w, height: h, left: (cw - w) / 2, top: (ch - h) / 2 };
  })();

  // Load keypoints JSON once ready.
  useEffect(() => {
    if (status !== 'ready' || !keypointsUrl) return;
    let cancelled = false;
    fetch(keypointsUrl)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        s.setKeypoints((data.frames ?? []) as KeypointFrame[], data.fps, data.frameCount);
      })
      .catch((e) => console.error('[AnnotationTracking] keypoints load failed', e));
    return () => { cancelled = true; };
  }, [status, keypointsUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load persisted annotations on open.
  useEffect(() => {
    if (!refId) return;
    apiClient
      .get<TrackedAnnotation[]>(`/sessions/${sessionId}/reference/${refId}/annotations`)
      .then((list) => s.setAnnotations(list))
      .catch((e) => console.error('[AnnotationTracking] annotations load failed', e));
  }, [refId, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Container resize observer.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerDims({ width: Math.round(e.contentRect.width), height: Math.round(e.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // rAF playhead → frameIndex.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    const tick = () => {
      const idx = Math.round(video.currentTime * fps);
      if (idx !== useAnnotationTrackingStore.getState().frameIndex) s.setFrameIndex(idx);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Size canvases to the visible video box.
  useEffect(() => {
    for (const c of [skeletonCanvasRef.current, annCanvasRef.current]) {
      if (c) { c.width = videoRect.width; c.height = videoRect.height; }
    }
  }, [videoRect.width, videoRect.height]);

  const frameKp = keypointsByFrame[frameIndex];
  const kpByName = (): Record<string, { x: number; y: number; score: number }> => {
    const m: Record<string, { x: number; y: number; score: number }> = {};
    if (frameKp) for (const k of frameKp.keypoints) m[k.name] = k;
    return m;
  };

  // Draw skeleton layer.
  useEffect(() => {
    const c = skeletonCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, videoRect.width, videoRect.height);
    if (!frameKp) return;
    const map = kpByName();
    const names = keypointNamesFor(keypointFormat);
    const ordered = names.map((n) => map[n]);

    const getActiveJoints = (): Set<string> => {
      const active = new Set<string>();
      for (const a of annotations) {
        if (frameIndex < a.fromFrame || (a.untilFrame != null && frameIndex > a.untilFrame)) continue;
        if (a.startJoint) active.add(a.startJoint);
        if (a.endJoint) active.add(a.endJoint);
        if (a.midJoint) active.add(a.midJoint);
      }
      for (const j of pendingJoints) active.add(j);
      if (hoveredJoint) active.add(hoveredJoint);
      return active;
    };

    if (showSkeleton) {
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#FFA500';
      for (const [a, b] of skeletonConnectionsFor(keypointFormat)) {
        const ka = ordered[a], kb = ordered[b];
        if (!ka || !kb || ka.score < MIN_SCORE || kb.score < MIN_SCORE) continue;
        ctx.beginPath();
        ctx.moveTo(ka.x * videoRect.width, ka.y * videoRect.height);
        ctx.lineTo(kb.x * videoRect.width, kb.y * videoRect.height);
        ctx.stroke();
      }
      for (const k of ordered) {
        if (!k || k.score < MIN_SCORE) continue;
        const px = k.x * videoRect.width, py = k.y * videoRect.height;
        ctx.lineWidth = 1.25; ctx.strokeStyle = 'rgba(15,23,42,0.85)';
        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      // Skeleton hidden: ONLY show active/annotated/pending/hovered joints
      const active = getActiveJoints();
      for (let i = 0; i < names.length; i++) {
        const name = names[i]!;
        const k = ordered[i];
        if (!k || k.score < MIN_SCORE || !active.has(name)) continue;
        const px = k.x * videoRect.width, py = k.y * videoRect.height;
        ctx.lineWidth = 1.25; ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }, [frameKp, showSkeleton, keypointFormat, videoRect.width, videoRect.height, annotations, pendingJoints, hoveredJoint]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw annotation layer — resolve each annotation's joints for this frame.
  useEffect(() => {
    const c = annCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, videoRect.width, videoRect.height);
    const map = kpByName();
    const W = videoRect.width, H = videoRect.height;
    const pt = (name: string | null) => {
      if (!name) return null;
      const k = map[name];
      if (!k || k.score < MIN_SCORE) return null;
      return { x: k.x * W, y: k.y * H };
    };

    for (const a of annotations) {
      if (frameIndex < a.fromFrame || (a.untilFrame != null && frameIndex > a.untilFrame)) continue;
      const isSel = a.id === selectedId;
      ctx.strokeStyle = a.color; ctx.fillStyle = a.color;
      ctx.lineWidth = a.thickness + (isSel ? 2 : 0); ctx.lineCap = 'round';
      const p1 = pt(a.startJoint);

      // Render Label / Text Note
      if (a.label && p1) {
        ctx.save();
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = a.color;
        ctx.textAlign = 'left';
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.lineWidth = 3;
        ctx.strokeText(a.label, p1.x + 12, p1.y - 12);
        ctx.fillText(a.label, p1.x + 12, p1.y - 12);
        ctx.restore();
      }

      if (a.shapeType === 'point') {
        if (p1) { ctx.beginPath(); ctx.arc(p1.x, p1.y, a.thickness * 3, 0, Math.PI * 2); ctx.stroke(); }
        continue;
      }

      const p2 = pt(a.endJoint);

      if (a.shapeType === 'circle') {
        if (p1 && p2) {
          const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          ctx.beginPath(); ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2); ctx.stroke();
        }
        if (isSel && p1 && p2) {
          ctx.fillStyle = a.color;
          for (const p of [p1, p2]) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
        }
        continue;
      }

      if (a.shapeType === 'angle') {
        const pm = pt(a.midJoint);
        if (p1 && pm && p2) {
          ctx.beginPath(); ctx.moveTo(pm.x, pm.y); ctx.lineTo(p1.x, p1.y); ctx.moveTo(pm.x, pm.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
          
          // Math for degrees arc & label
          const v1 = { x: p1.x - pm.x, y: p1.y - pm.y };
          const v2 = { x: p2.x - pm.x, y: p2.y - pm.y };
          const a1 = Math.atan2(v1.y, v1.x);
          const a2 = Math.atan2(v2.y, v2.x);
          let diff = a2 - a1;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          const deg = Math.round(Math.abs(diff) * 180 / Math.PI);

          ctx.save();
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pm.x, pm.y, 22, a1, a2, diff < 0);
          ctx.stroke();
          ctx.restore();

          const bisector = a1 + diff / 2;
          const tx = pm.x + 36 * Math.cos(bisector);
          const ty = pm.y + 36 * Math.sin(bisector);
          ctx.save();
          ctx.font = 'bold 11px Inter, system-ui, sans-serif';
          ctx.fillStyle = a.color;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)'; ctx.lineWidth = 3;
          ctx.strokeText(`${deg}°`, tx, ty);
          ctx.fillText(`${deg}°`, tx, ty);
          ctx.restore();
        }
        if (isSel && p1 && pm && p2) {
          ctx.fillStyle = a.color;
          for (const p of [p1, pm, p2]) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
        }
        continue;
      }

      if (!p1 || !p2) continue;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();

      if (a.shapeType === 'arrow') {
        const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x), head = 12 + a.thickness * 2;
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y); ctx.lineTo(p2.x - head * Math.cos(ang - Math.PI / 6), p2.y - head * Math.sin(ang - Math.PI / 6));
        ctx.moveTo(p2.x, p2.y); ctx.lineTo(p2.x - head * Math.cos(ang + Math.PI / 6), p2.y - head * Math.sin(ang + Math.PI / 6));
        ctx.stroke();
      }
      if (isSel) { ctx.fillStyle = a.color; for (const p of [p1, p2]) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); } }
    }

    // Highlight hovered joint
    if (hoveredJoint) {
      const p = pt(hoveredJoint);
      if (p) {
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }

    // Draw ghost preview during multi-point placement
    if (pendingJoints.length > 0 && mousePos) {
      ctx.save();
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.lineWidth = thickness; ctx.globalAlpha = 0.5;
      ctx.setLineDash([5, 5]);

      const p1 = pt(pendingJoints[0] ?? null);

      if (shapeType === 'line' && p1) {
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke();
      } else if (shapeType === 'arrow' && p1) {
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke();
        const ang = Math.atan2(mousePos.y - p1.y, mousePos.x - p1.x), head = 12;
        ctx.beginPath(); ctx.moveTo(mousePos.x, mousePos.y);
        ctx.lineTo(mousePos.x - head * Math.cos(ang - Math.PI / 6), mousePos.y - head * Math.sin(ang - Math.PI / 6));
        ctx.moveTo(mousePos.x, mousePos.y);
        ctx.lineTo(mousePos.x - head * Math.cos(ang + Math.PI / 6), mousePos.y - head * Math.sin(ang + Math.PI / 6));
        ctx.stroke();
      } else if (shapeType === 'circle' && p1) {
        const r = Math.hypot(mousePos.x - p1.x, mousePos.y - p1.y);
        ctx.beginPath(); ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2); ctx.stroke();
      } else if (shapeType === 'angle' && p1) {
        if (pendingJoints.length === 1) {
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke();
        } else if (pendingJoints.length === 2) {
          const pm = pt(pendingJoints[1] ?? null);
          if (pm) {
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(pm.x, pm.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(pm.x, pm.y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke();
            
            const v1 = { x: p1.x - pm.x, y: p1.y - pm.y };
            const v2 = { x: mousePos.x - pm.x, y: mousePos.y - pm.y };
            const a1 = Math.atan2(v1.y, v1.x);
            const a2 = Math.atan2(v2.y, v2.x);
            let diff = a2 - a1;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            const deg = Math.round(Math.abs(diff) * 180 / Math.PI);
            ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(`${deg}°`, pm.x + 20, pm.y - 20);
          }
        }
      }
      ctx.restore();
    }

    // Highlight pending joints being picked.
    for (const jn of pendingJoints) {
      const p = pt(jn);
      if (p) {
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
  }, [annotations, selectedId, frameIndex, frameKp, pendingJoints, color, hoveredJoint, mousePos, videoRect.width, videoRect.height]); // eslint-disable-line react-hooks/exhaustive-deps

  const nearestJoint = (px: number, py: number): string | null => {
    const map = kpByName();
    let best: { name: string; d: number } | null = null;
    for (const [name, k] of Object.entries(map)) {
      if (k.score < MIN_SCORE) continue;
      const d = Math.hypot(k.x * videoRect.width - px, k.y * videoRect.height - py);
      if (d <= JOINT_SNAP_PX && (!best || d < best.d)) best = { name, d };
    }
    return best?.name ?? null;
  };

  const nearestAnnotation = (px: number, py: number): string | null => {
    const map = kpByName();
    const P = (n: string | null) => { if (!n) return null; const k = map[n]; return k && k.score >= MIN_SCORE ? { x: k.x * videoRect.width, y: k.y * videoRect.height } : null; };
    let best: { id: string; d: number } | null = null;
    for (const a of annotations) {
      if (frameIndex < a.fromFrame || (a.untilFrame != null && frameIndex > a.untilFrame)) continue;
      const p1 = P(a.startJoint), p2 = P(a.endJoint);
      let d = Infinity;
      if (a.shapeType === 'point' && p1) d = Math.hypot(p1.x - px, p1.y - py);
      else if (p1 && p2) {
        const t = Math.max(0, Math.min(1, ((px - p1.x) * (p2.x - p1.x) + (py - p1.y) * (p2.y - p1.y)) / ((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 || 1)));
        d = Math.hypot(p1.x + t * (p2.x - p1.x) - px, p1.y + t * (p2.y - p1.y) - py);
      }
      if (d <= 12 && (!best || d < best.d)) best = { id: a.id, d };
    }
    return best?.id ?? null;
  };

  const handleCanvasClick = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isCoach || !refId) return;
    const rect = annCanvasRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * videoRect.width;
    const py = ((e.clientY - rect.top) / rect.height) * videoRect.height;

    // Select mode (no shape picking in progress): pick an existing annotation.
    const joint = nearestJoint(px, py);
    if (!joint) {
      const annId = nearestAnnotation(px, py);
      s.select(annId);
      if (!annId) s.clearPending();
      return;
    }

    const next = [...pendingJoints, joint];
    const need = jointsNeeded(shapeType);
    if (next.length < need) { s.addPendingJoint(joint); return; }

    // Enough joints — create the annotation.
    s.clearPending();
    setBusy(true);
    try {
      const dto = {
        shapeType,
        startJoint: next[0]!,
        endJoint: need >= 2 ? next[need === 3 ? 2 : 1]! : null,
        midJoint: need === 3 ? next[1]! : null,
        color,
        thickness,
        fromFrame: 0,
        untilFrame: null,
      };
      const created = await apiClient.post<typeof dto, TrackedAnnotation>(
        `/sessions/${sessionId}/reference/${refId}/annotations`,
        dto,
      );
      s.applyRemoteCreate(created);
      s.pushUndo({ type: 'create', annotation: created });
      s.select(created.id);
    } catch (err) {
      console.error('[AnnotationTracking] create failed', err);
    } finally {
      setBusy(false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isCoach || !refId) return;
    const rect = annCanvasRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * videoRect.width;
    const py = ((e.clientY - rect.top) / rect.height) * videoRect.height;
    setMousePos({ x: px, y: py });

    const joint = nearestJoint(px, py);
    if (joint !== hoveredJoint) {
      setHoveredJoint(joint);
    }
  };

  const handlePointerLeave = () => {
    setHoveredJoint(null);
    setMousePos(null);
  };

  // Keyboard shortcuts and Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if currently typing in an input element
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        s.clearPending();
        s.select(null);
      }

      const key = e.key.toLowerCase();
      if (key === 'l') { s.setShape('line'); s.clearPending(); }
      else if (key === 'c') { s.setShape('circle'); s.clearPending(); }
      else if (key === 'a') { s.setShape('angle'); s.clearPending(); }
      else if (key === 'p') { s.setShape('point'); s.clearPending(); }
      else if (key === 't') {
        if (selectedId) {
          const inp = document.getElementById('annotation-label-input');
          inp?.focus();
        } else {
          s.setShape('line'); s.clearPending(); s.select(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteSelected = async () => {
    if (!refId || !selectedId) return;
    const ann = annotations.find((a) => a.id === selectedId);
    if (!ann) return;
    setBusy(true);
    try {
      await apiClient.del(`/sessions/${sessionId}/reference/${refId}/annotations/${selectedId}`);
      s.applyRemoteDelete(selectedId);
      s.pushUndo({ type: 'delete', annotation: ann });
    } catch (e) {
      console.error('[AnnotationTracking] delete failed', e);
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    const op = s.undoStack[s.undoStack.length - 1];
    if (!op || !refId) return;
    useAnnotationTrackingStore.setState((st) => ({ undoStack: st.undoStack.slice(0, -1), redoStack: [...st.redoStack, op] }));
    try {
      if (op.type === 'create') {
        await apiClient.del(`/sessions/${sessionId}/reference/${refId}/annotations/${op.annotation.id}`);
        s.applyRemoteDelete(op.annotation.id);
      } else {
        const created = await recreate(op.annotation);
        if (created) s.applyRemoteCreate(created);
      }
    } catch (e) { console.error('[AnnotationTracking] undo failed', e); }
  };

  const redo = async () => {
    const op = s.redoStack[s.redoStack.length - 1];
    if (!op || !refId) return;
    useAnnotationTrackingStore.setState((st) => ({ redoStack: st.redoStack.slice(0, -1), undoStack: [...st.undoStack, op] }));
    try {
      if (op.type === 'create') {
        const created = await recreate(op.annotation);
        if (created) s.applyRemoteCreate(created);
      } else {
        await apiClient.del(`/sessions/${sessionId}/reference/${refId}/annotations/${op.annotation.id}`);
        s.applyRemoteDelete(op.annotation.id);
      }
    } catch (e) { console.error('[AnnotationTracking] redo failed', e); }
  };

  const recreate = async (a: TrackedAnnotation): Promise<TrackedAnnotation | null> => {
    if (!refId) return null;
    const dto = {
      shapeType: a.shapeType, startJoint: a.startJoint, endJoint: a.endJoint, midJoint: a.midJoint,
      color: a.color, thickness: a.thickness, fromFrame: a.fromFrame, untilFrame: a.untilFrame,
    };
    return apiClient.post<typeof dto, TrackedAnnotation>(`/sessions/${sessionId}/reference/${refId}/annotations`, dto);
  };

  const changeSelectedColor = async (c: string) => {
    s.setColor(c);
    if (!refId || !selectedId) return;
    try {
      const upd = await apiClient.patch<{ color: string }, TrackedAnnotation>(`/sessions/${sessionId}/reference/${refId}/annotations/${selectedId}`, { color: c });
      s.applyRemoteUpdate(upd);
    } catch (e) { console.error(e); }
  };
  const changeSelectedThickness = async (t: number) => {
    s.setThickness(t);
    if (!refId || !selectedId) return;
    try {
      const upd = await apiClient.patch<{ thickness: number }, TrackedAnnotation>(`/sessions/${sessionId}/reference/${refId}/annotations/${selectedId}`, { thickness: t });
      s.applyRemoteUpdate(upd);
    } catch (e) { console.error(e); }
  };

  const changeSelectedLabel = async (lbl: string) => {
    if (!refId || !selectedId) return;
    const ann = annotations.find((a) => a.id === selectedId);
    if (!ann) return;

    s.applyRemoteUpdate({ ...ann, label: lbl || null });

    try {
      const upd = await apiClient.patch<{ label: string | null }, TrackedAnnotation>(
        `/sessions/${sessionId}/reference/${refId}/annotations/${selectedId}`,
        { label: lbl || null }
      );
      s.applyRemoteUpdate(upd);
    } catch (e) {
      console.error('[AnnotationTracking] failed to update label', e);
    }
  };

  const togglePlay = () => {
    const v = videoRef.current; if (!v || !(fps > 0)) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  };
  const step = (d: number) => {
    const v = videoRef.current; if (!v || !(fps > 0)) return;
    const clamped = Math.max(0, Math.min(frameCount > 0 ? frameCount - 1 : frameIndex + d, frameIndex + d));
    v.currentTime = clamped / fps; s.setFrameIndex(clamped);
  };

  const startExport = async () => {
    if (!refId || exporting) return;
    setExporting(true);
    try {
      await apiClient.post(`/sessions/${sessionId}/reference/${refId}/export`, {});
    } catch (e) {
      console.error('[AnnotationTracking] export failed', e);
      setExporting(false);
    }
  };

  // When the export URL arrives (socket refresh), stop the spinner.
  useEffect(() => { if (exportVideoUrl) setExporting(false); }, [exportVideoUrl]);

  const downloadExport = async () => {
    if (!exportVideoUrl || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(exportVideoUrl);
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u; a.download = `annotated-${new Date().toISOString().slice(0, 10)}.mp4`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
    } catch (e) { console.error(e); } finally { setDownloading(false); }
  };

  const handleClose = () => s.close();

  if (!refId || !videoUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl h-[88vh] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-900 bg-slate-900">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Annotation Tracking</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-950/40 border border-indigo-800 text-indigo-300 uppercase tracking-wider">
              Joints follow the body
            </span>
            {status === 'processing' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/40 border border-amber-800 text-amber-400 uppercase tracking-wider animate-pulse">Analyzing…</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {exportVideoUrl ? (
              <button onClick={downloadExport} disabled={downloading} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> {downloading ? 'Preparing…' : 'Download'}
              </button>
            ) : isCoach && status === 'ready' && (
              <button onClick={startExport} disabled={exporting} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5">
                {exporting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting…</> : <><Download className="w-3.5 h-3.5" /> Export MP4</>}
              </button>
            )}
            <button onClick={handleClose} className="text-slate-400 hover:text-white px-2" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col sm:flex-row min-h-0">
          <div ref={containerRef} className="flex-1 relative bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain"
              playsInline
              onLoadedMetadata={() => { const v = videoRef.current; if (v) setVideoIntrinsic({ width: v.videoWidth, height: v.videoHeight }); }}
              onPlay={() => s.setPlaying(true)}
              onPause={() => s.setPlaying(false)}
            />
            <canvas ref={skeletonCanvasRef} className="absolute pointer-events-none" style={{ left: videoRect.left, top: videoRect.top, width: videoRect.width, height: videoRect.height }} />
            <canvas
              ref={annCanvasRef}
              className={`absolute ${isCoach ? 'cursor-crosshair touch-none' : 'pointer-events-none'}`}
              style={{ left: videoRect.left, top: videoRect.top, width: videoRect.width, height: videoRect.height }}
              onPointerDown={handleCanvasClick}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
            />
            {status === 'processing' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                <p className="text-sm font-semibold text-slate-300">Analyzing video…</p>
                <p className="text-xs text-slate-500">Detecting the skeleton so annotations can track the body.</p>
              </div>
            )}
            {isCoach && status === 'ready' && (
              <div className="absolute top-3 left-3 z-10 bg-slate-950/85 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 flex flex-col gap-1">
                <div>
                  {pendingJoints.length > 0
                    ? `Click ${jointsNeeded(shapeType) - pendingJoints.length} more joint(s) to complete`
                    : shapeType === 'point'
                      ? 'Click a joint to mark it'
                      : shapeType === 'angle'
                        ? 'Click three joints to draw angle'
                        : 'Click two joints to connect them'}
                </div>
                {pendingJoints.length > 0 && (
                  <div className="text-[10px] text-indigo-400 font-mono">
                    Selected: {pendingJoints.join(' → ')}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Toolbar — coach only */}
          {isCoach && (
            <div className="w-full sm:w-60 max-h-[38vh] sm:max-h-none border-t sm:border-t-0 sm:border-l border-slate-900 bg-slate-900 p-4 flex flex-col gap-4 overflow-y-auto">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Shape</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {SHAPES.map((sh) => (
                    <button key={sh.id} onClick={() => s.setShape(sh.id)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-semibold border transition ${shapeType === sh.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'}`}>
                      <sh.icon className="w-4 h-4" /> {sh.label}
                    </button>
                  ))}
                  <button onClick={() => { s.setShape('line'); s.clearPending(); s.select(null); }}
                    className="flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-semibold border bg-slate-950 border-slate-800 text-slate-400 hover:text-white transition">
                    <MousePointer2 className="w-4 h-4" /> Select
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Color</div>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => changeSelectedColor(c)} style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-white' : 'border-slate-700'}`} />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Thickness</div>
                <div className="flex items-center gap-1.5">
                  {THICKNESSES.map((t) => (
                    <button key={t} onClick={() => changeSelectedThickness(t)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${thickness === t ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'}`}>{t}px</button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-900">
                {selectedId && (
                  <div className="mb-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Text Note / Label</div>
                    <input
                      id="annotation-label-input"
                      type="text"
                      value={annotations.find((a) => a.id === selectedId)?.label ?? ''}
                      onChange={(e) => changeSelectedLabel(e.target.value)}
                      placeholder="e.g. Keep elbow high"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
                <button onClick={deleteSelected} disabled={!selectedId || busy} className="text-xs text-left px-2 py-1.5 rounded-lg text-red-400 hover:bg-red-950/20 disabled:opacity-40 inline-flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Delete selected</button>
                <div className="flex gap-1.5">
                  <button onClick={undo} disabled={s.undoStack.length === 0} className="flex-1 text-xs px-2 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"><Undo2 className="w-3.5 h-3.5" /> Undo</button>
                  <button onClick={redo} disabled={s.redoStack.length === 0} className="flex-1 text-xs px-2 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"><Redo2 className="w-3.5 h-3.5" /> Redo</button>
                </div>
                <button onClick={() => s.toggleSkeleton()} className="text-xs text-left px-2 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1.5">{showSkeleton ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} {showSkeleton ? 'Hide' : 'Show'} skeleton</button>
              </div>

              <div className="pt-2 border-t border-slate-900 text-[10px] text-slate-500 leading-snug">
                {annotations.length} annotation(s). Each is attached to body joints and follows them through the whole video — press play.
              </div>
            </div>
          )}
        </div>

        {/* Playback */}
        <div className="border-t border-slate-900 bg-slate-900 px-5 py-3 flex items-center gap-3 flex-wrap">
          {isCoach && (
            <>
              <button onClick={() => step(-1)} className="bg-slate-800 hover:bg-slate-700 text-white text-xs px-2.5 py-1.5 rounded-md"><StepBack className="w-3.5 h-3.5" /></button>
              <button onClick={togglePlay} className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md inline-flex items-center gap-1.5">{playing ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Play</>}</button>
              <button onClick={() => step(1)} className="bg-slate-800 hover:bg-slate-700 text-white text-xs px-2.5 py-1.5 rounded-md"><StepForward className="w-3.5 h-3.5" /></button>
            </>
          )}
          <span className="text-slate-400 text-xs font-mono tabular-nums ml-1">frame {frameIndex}{frameCount ? ` / ${frameCount}` : ''}</span>
        </div>
      </div>
    </div>
  );
}
