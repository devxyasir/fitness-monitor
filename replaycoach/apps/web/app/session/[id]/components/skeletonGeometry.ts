/**
 * "Snap to joint" support for the reference-analysis modal's draw tool — the
 * skeleton itself is no longer rendered here at all; it's burned directly
 * onto the video's own pixels by the pose-service (see
 * apps/pose-service/reference_processor.py). This just lets the coach snap
 * a drawn shape onto a detected joint's coordinates using the same
 * keypoints JSON the video was annotated from.
 */

export interface NamedPoint {
  x: number;
  y: number;
  score: number;
}

/** Below this confidence, a keypoint isn't eligible to snap onto — matches
 * the same MIN_SCORE the pose-service uses when burning in the skeleton. */
export const MIN_SCORE = 0.3;

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
