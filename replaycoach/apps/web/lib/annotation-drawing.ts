/**
 * Shared Canvas2D drawing primitives for annotation shapes. Extracted from
 * AnnotationCanvas.tsx (the live replay popup), which previously had the
 * only complete implementation — ClipPlaybackModal.tsx (the Clips page)
 * hand-rolled a separate, slightly different version missing angle/point-
 * marker/joint-dot support entirely. Both now render through this single
 * module so a shape looks pixel-identical wherever it's viewed.
 *
 * Deliberately does NOT resolve annotation geometry (jointRef lookups,
 * normalized-to-pixel conversion) — callers pass already-resolved pixel
 * `Pt` values. AnnotationCanvas resolves jointRef against live/replay pose
 * data and falls back to fixed geometry; ClipPlaybackModal always uses
 * fixed geometry (no continuing pose data exists for a saved clip — see
 * the plan's "confirmed dead end" note). Only the actual painting is shared.
 */

export type Pt = { x: number; y: number };

export function drawLine(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

export function drawArrow(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = 10 + width * 2;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

export function drawCircle(ctx: CanvasRenderingContext2D, c: Pt, r: number, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, 2 * Math.PI);
  ctx.stroke();
}

export function drawPointMarker(ctx: CanvasRenderingContext2D, p: Pt, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, width);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2.5, 0, 2 * Math.PI);
  ctx.fill();
}

export function drawAngle(ctx: CanvasRenderingContext2D, a: Pt, vertex: Pt, b: Pt, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(vertex.x, vertex.y);
  ctx.lineTo(a.x, a.y);
  ctx.moveTo(vertex.x, vertex.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
  const v2 = { x: b.x - vertex.x, y: b.y - vertex.y };
  const a1 = Math.atan2(v1.y, v1.x);
  const a2 = Math.atan2(v2.y, v2.x);
  let diff = a2 - a1;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const deg = Math.round(Math.abs(diff) * 180 / Math.PI);

  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(vertex.x, vertex.y, 22, a1, a2, diff < 0);
  ctx.stroke();
  ctx.restore();

  const bisector = a1 + diff / 2;
  const tx = vertex.x + 36 * Math.cos(bisector);
  const ty = vertex.y + 36 * Math.sin(bisector);
  ctx.save();
  ctx.font = 'bold 12px Inter, system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.lineWidth = 3;
  ctx.strokeText(`${deg}°`, tx, ty);
  ctx.fillText(`${deg}°`, tx, ty);
  ctx.restore();
}

/** Small ring marking a shape's joint-attached endpoint — same visual
 * language as the reference-tracking system's joint markers. */
export function drawJointDot(ctx: CanvasRenderingContext2D, p: Pt): void {
  ctx.save();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawTextLabel(ctx: CanvasRenderingContext2D, p: Pt, text: string, color: string): void {
  ctx.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(text, p.x, p.y);
}
