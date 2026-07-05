'use client';

import { useEffect, useRef, useState } from 'react';
import { useAnnotationStore, ClientAnnotation, getVisibleAnnotations, AnnotationTool } from '../../../../stores/annotation-store';
import { useAnnotationSocket } from '../hooks/useAnnotationSocket';

interface AnnotationCanvasProps {
  sessionId: string;
  frameTimestampMs: number;
  isCoach: boolean;
  selectedStudentIds?: string[];
}

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

// ----------------------------------------------------
// UI Canvas Drawing Helpers
// ----------------------------------------------------
function drawArrow(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - 15 * Math.cos(angle - Math.PI / 6), toY - 15 * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - 15 * Math.cos(angle + Math.PI / 6), toY - 15 * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();
}

// ----------------------------------------------------
// Main Component
// ----------------------------------------------------
export function AnnotationCanvas({
  sessionId,
  frameTimestampMs,
  isCoach,
  selectedStudentIds,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { activeTool, activeColor, annotations, setActiveTool, setActiveColor } = useAnnotationStore();
  const { drawAnnotation, undoAnnotation, clearAnnotationLayer } = useAnnotationSocket(sessionId);

  // Drawing tracking variables (imperative, refs to avoid React updates during draw cycles)
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const currentPathPointsRef = useRef<number[]>([]);

  // Text tools overlay variables
  const [textInputPos, setTextInputPos] = useState<{ x: number; y: number } | null>(null);
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  const visibleAnnotations = getVisibleAnnotations(annotations, frameTimestampMs);

  const drawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw saved annotations
    for (const ann of visibleAnnotations) {
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
          drawArrow(ctx, from[0] * width, from[1] * height, to[0] * width, to[1] * height, color);
        }
      } else if (ann.type === 'circle') {
        const cx = ann.geometry.cx * width;
        const cy = ann.geometry.cy * height;
        const r = ann.geometry.r * Math.min(width, height);
        drawCircle(ctx, cx, cy, r, color);
      } else if (ann.type === 'text') {
        const x = ann.geometry.x * width;
        const y = ann.geometry.y * height;
        if (ann.textContent) {
          ctx.font = 'bold 16px Inter, system-ui, sans-serif';
          ctx.fillStyle = color;
          ctx.fillText(ann.textContent, x, y);
        }
      }
    }
  };

  // Handle resizing canvas dynamically to match container aspect ratio
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      drawAll();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [annotations, frameTimestampMs]);

  // Redraw when visible annotations change
  useEffect(() => {
    drawAll();
  }, [annotations, frameTimestampMs]);

  // Pointer event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isCoach) return;
    if (textInputPos) {
      commitTextAnnotation();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    isDrawingRef.current = true;
    startPointRef.current = { x, y };

    if (activeTool === 'pen') {
      currentPathPointsRef.current = [x / rect.width, y / rect.height];
    } else if (activeTool === 'text') {
      setTextInputPos({ x, y });
      setTimeout(() => textInputRef.current?.focus(), 50);
      isDrawingRef.current = false;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isCoach || !isDrawingRef.current || !startPointRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Draw temporary preview imperatively directly to canvas
    drawAll();

    ctx.strokeStyle = activeColor;
    ctx.fillStyle = activeColor;

    if (activeTool === 'pen') {
      const width = rect.width;
      const height = rect.height;
      currentPathPointsRef.current.push(x / width, y / height);

      // Render the freehand stroke preview
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const pts = currentPathPointsRef.current;
      if (pts.length >= 2) {
        ctx.moveTo(pts[0]! * width, pts[1]! * height);
        for (let i = 2; i < pts.length; i += 2) {
          ctx.lineTo(pts[i]! * width, pts[i + 1]! * height);
        }
        ctx.stroke();
      }
    } else if (activeTool === 'arrow') {
      drawArrow(ctx, startPointRef.current.x, startPointRef.current.y, x, y, activeColor);
    } else if (activeTool === 'circle') {
      const dx = x - startPointRef.current.x;
      const dy = y - startPointRef.current.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      drawCircle(ctx, startPointRef.current.x, startPointRef.current.y, r, activeColor);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isCoach || !isDrawingRef.current) return;
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    if (!canvas || !startPointRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let geometry: any = {};
    const type: 'pen' | 'arrow' | 'circle' = activeTool === 'arrow' ? 'arrow' : activeTool === 'circle' ? 'circle' : 'pen';

    if (activeTool === 'pen') {
      const rawPoints = currentPathPointsRef.current;
      const simplified = simplifyFlatPoints(rawPoints, 0.003);
      geometry = { points: simplified };
    } else if (activeTool === 'arrow') {
      geometry = {
        from: [startPointRef.current.x / rect.width, startPointRef.current.y / rect.height],
        to: [x / rect.width, y / rect.height],
      };
    } else if (activeTool === 'circle') {
      const dx = x - startPointRef.current.x;
      const dy = y - startPointRef.current.y;
      const r = Math.sqrt(dx * dx + dy * dy) / Math.min(rect.width, rect.height);
      geometry = {
        cx: startPointRef.current.x / rect.width,
        cy: startPointRef.current.y / rect.height,
        r,
      };
    }

    if (activeTool === 'pen' || activeTool === 'arrow' || activeTool === 'circle') {
      const newAnn: ClientAnnotation = {
        type,
        frameTimestampMs,
        geometry,
        color: activeColor,
        createdAt: new Date().toISOString(),
      };

      // Add to store and socket emit optimistically
      useAnnotationStore.getState().addAnnotation(newAnn);
      drawAnnotation(newAnn, selectedStudentIds);
    }

    startPointRef.current = null;
    currentPathPointsRef.current = [];
    drawAll();
  };

  const commitTextAnnotation = () => {
    if (!textInputPos || !textInputValue.trim()) {
      setTextInputPos(null);
      setTextInputValue('');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const xNormalized = textInputPos.x / rect.width;
    const yNormalized = textInputPos.y / rect.height;

    const newAnn: ClientAnnotation = {
      type: 'text',
      frameTimestampMs,
      geometry: { x: xNormalized, y: yNormalized },
      textContent: textInputValue.trim(),
      color: activeColor,
      createdAt: new Date().toISOString(),
    };

    useAnnotationStore.getState().addAnnotation(newAnn);
    drawAnnotation(newAnn, selectedStudentIds);

    setTextInputPos(null);
    setTextInputValue('');
    drawAll();
  };

  const handleUndo = () => {
    if (!isCoach) return;
    useAnnotationStore.getState().undoLastAnnotation(frameTimestampMs);
    undoAnnotation(frameTimestampMs, selectedStudentIds);
  };

  const handleClear = () => {
    if (!isCoach) return;
    useAnnotationStore.getState().clearAnnotations(frameTimestampMs);
    clearAnnotationLayer(frameTimestampMs, selectedStudentIds);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full select-none bg-slate-900/10">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`absolute inset-0 w-full h-full block ${
          isCoach ? 'cursor-crosshair touch-none' : 'pointer-events-none'
        }`}
        aria-label="Annotation Drawing Panel"
      />

      {/* Overlay Inputs Area for Annotations */}
      {textInputPos && (
        <input
          ref={textInputRef}
          type="text"
          value={textInputValue}
          onChange={(e) => setTextInputValue(e.target.value)}
          onBlur={commitTextAnnotation}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTextAnnotation();
            if (e.key === 'Escape') {
              setTextInputPos(null);
              setTextInputValue('');
            }
          }}
          style={{
            position: 'absolute',
            left: textInputPos.x,
            top: textInputPos.y - 12,
            color: activeColor,
            font: 'bold 16px Inter, sans-serif',
            background: 'rgba(15, 23, 42, 0.9)',
            border: `1.5px solid ${activeColor}`,
            borderRadius: '4px',
            padding: '2px 6px',
            outline: 'none',
            zIndex: 30,
            width: '180px',
          }}
          placeholder="Type label..."
        />
      )}

      {/* Coach Drawing Dashboard Layer */}
      {isCoach && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-slate-900/90 hover:bg-slate-900 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-800 shadow-2xl z-20 transition">
          <div className="flex items-center gap-1.5 border-r border-slate-800 pr-3">
            {(['pen', 'arrow', 'circle', 'text'] as AnnotationTool[]).map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => {
                  setActiveTool(tool);
                  setTextInputPos(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                  activeTool === tool
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                {tool === 'pen' && '✏️ Pen'}
                {tool === 'arrow' && '➡️ Arrow'}
                {tool === 'circle' && '⭕ Circle'}
                {tool === 'text' && '🔤 Text'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 border-r border-slate-800 pr-3">
            {['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE'].map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setActiveColor(color)}
                style={{ backgroundColor: color }}
                className={`w-5 h-5 rounded-full border-2 transition ${
                  activeColor === color ? 'border-white scale-110 shadow' : 'border-transparent hover:scale-105'
                }`}
                title={`Select color ${color}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUndo}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white font-medium rounded-lg hover:bg-slate-800 transition"
              title="Undo last stroke"
            >
              ↩️ Undo
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 font-semibold rounded-lg hover:bg-red-950/20 transition"
              title="Clear all strokes"
            >
              🗑️ Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
