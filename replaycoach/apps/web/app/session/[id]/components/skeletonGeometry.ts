/**
 * Skeleton rendering for the reference-analysis modal — a direct port of
 * apps/pose-service/process_1mp4.py's draw_skeleton()/SKELETON_CONNECTIONS,
 * which produced noticeably cleaner results than this module's prior
 * approach (derived neck/spine/mid-hip points, plus a confidence *fade*
 * instead of a hard cutoff — meaning low-confidence, often-wrong keypoints
 * during fast/occluded motion still got drawn, just faintly). Matches the
 * live per-participant overlay (SkeletonOverlay.tsx), which already used
 * this same simple direct-connection + hard-cutoff style. No derived
 * points, no per-segment fade — only real detected keypoints, drawn or not.
 */

import { COCO_KEYPOINT_NAMES, COCO_SKELETON_CONNECTIONS } from '@replaycoach/types';

export interface NamedPoint {
  x: number;
  y: number;
  score: number;
}

/** Below this confidence, a keypoint (and any segment touching it) is not
 * drawn at all — matches process_1mp4.py's MIN_SCORE exactly. */
export const MIN_SCORE = 0.3;

/** Matches process_1mp4.py's cv2 line/circle color (0, 165, 255) BGR = #FFA500 RGB. */
const SKELETON_COLOR = '#FFA500';

/**
 * Draws the skeleton on a canvas exactly as process_1mp4.py's
 * draw_skeleton() does: direct COCO-17 connections only, single color, hard
 * MIN_SCORE cutoff (not a confidence fade).
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  keypoints: { name: string; x: number; y: number; score: number }[],
  width: number,
  height: number,
): void {
  const kpMap = new Map<string, NamedPoint>();
  for (const kp of keypoints) kpMap.set(kp.name, kp);
  const ordered = COCO_KEYPOINT_NAMES.map((name) => kpMap.get(name));

  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = SKELETON_COLOR;
  for (const [a, b] of COCO_SKELETON_CONNECTIONS) {
    const kpA = ordered[a];
    const kpB = ordered[b];
    if (!kpA || !kpB || kpA.score < MIN_SCORE || kpB.score < MIN_SCORE) continue;
    ctx.beginPath();
    ctx.moveTo(kpA.x * width, kpA.y * height);
    ctx.lineTo(kpB.x * width, kpB.y * height);
    ctx.stroke();
  }

  for (const kp of ordered) {
    if (!kp || kp.score < MIN_SCORE) continue;
    const px = kp.x * width;
    const py = kp.y * height;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SKELETON_COLOR;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Finds the closest real detected keypoint to a pointer position, for
 * "snap to joint" — lets a coach precisely circle a specific point instead
 * of eyeballing it. Returns null if nothing is within maxDistPx.
 */
export function findNearestJoint(
  keypoints: { name: string; x: number; y: number; score: number }[],
  pxX: number,
  pxY: number,
  width: number,
  height: number,
  maxDistPx: number,
): { name: string; x: number; y: number } | null {
  let best: { name: string; x: number; y: number; dist: number } | null = null;
  for (const kp of keypoints) {
    if (kp.score < MIN_SCORE) continue;
    const x = kp.x * width;
    const y = kp.y * height;
    const dist = Math.hypot(x - pxX, y - pxY);
    if (dist <= maxDistPx && (!best || dist < best.dist)) {
      best = { name: kp.name, x: kp.x, y: kp.y, dist };
    }
  }
  return best ? { name: best.name, x: best.x, y: best.y } : null;
}
