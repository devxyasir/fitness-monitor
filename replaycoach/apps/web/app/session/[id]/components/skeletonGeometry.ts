/**
 * Enriched skeleton rendering for the reference-analysis modal.
 *
 * The pose model only ever detects the real COCO-17 keypoints — that stays
 * the single source of truth in storage. This module adds a few
 * anatomically-derived points (neck, spine midpoint, mid-hip, computed as
 * midpoints of real detections) purely for a fuller, more teachable
 * skeleton — more segments to point at, a proper spine ladder instead of a
 * shoulder-to-hip "X", and per-body-region coloring so a coach can describe
 * "look at the left arm" and have it visually distinct.
 */

export interface NamedPoint {
  x: number;
  y: number;
  score: number;
}

export interface SkeletonSegment {
  a: string;
  b: string;
  color: string;
}

export const REGION_COLORS = {
  face: '#A78BFA', // violet
  leftArm: '#34D399', // emerald
  rightArm: '#60A5FA', // blue
  spine: '#F59E0B', // amber
  leftLeg: '#F87171', // red
  rightLeg: '#FB923C', // orange
} as const;

/** Midpoint of two named points; undefined if either input is missing/low-confidence. */
function midpoint(a: NamedPoint | undefined, b: NamedPoint | undefined): NamedPoint | undefined {
  if (!a || !b || a.score < 0.3 || b.score < 0.3) return undefined;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, score: Math.min(a.score, b.score) };
}

/**
 * Builds a name -> point map from the raw detected keypoints, plus derived
 * 'neck', 'spine_mid', and 'mid_hip' points for a fuller torso structure.
 */
export function buildExtendedKeypoints(
  raw: { name: string; x: number; y: number; score: number }[],
): Map<string, NamedPoint> {
  const map = new Map<string, NamedPoint>();
  for (const kp of raw) map.set(kp.name, kp);

  const neck = midpoint(map.get('left_shoulder'), map.get('right_shoulder'));
  const midHip = midpoint(map.get('left_hip'), map.get('right_hip'));
  if (neck) map.set('neck', neck);
  if (midHip) map.set('mid_hip', midHip);
  const spineMid = midpoint(neck, midHip);
  if (spineMid) map.set('spine_mid', spineMid);

  return map;
}

/** Every line segment to draw, each tagged with its region color. */
export const SKELETON_SEGMENTS: SkeletonSegment[] = [
  // face
  { a: 'nose', b: 'left_eye', color: REGION_COLORS.face },
  { a: 'nose', b: 'right_eye', color: REGION_COLORS.face },
  { a: 'left_eye', b: 'left_ear', color: REGION_COLORS.face },
  { a: 'right_eye', b: 'right_ear', color: REGION_COLORS.face },
  { a: 'nose', b: 'neck', color: REGION_COLORS.face },
  // spine ladder (derived points give a straight spine line instead of an
  // ambiguous shoulder-to-hip "X" — useful for teaching posture/alignment)
  { a: 'neck', b: 'left_shoulder', color: REGION_COLORS.spine },
  { a: 'neck', b: 'right_shoulder', color: REGION_COLORS.spine },
  { a: 'neck', b: 'spine_mid', color: REGION_COLORS.spine },
  { a: 'spine_mid', b: 'mid_hip', color: REGION_COLORS.spine },
  { a: 'mid_hip', b: 'left_hip', color: REGION_COLORS.spine },
  { a: 'mid_hip', b: 'right_hip', color: REGION_COLORS.spine },
  // left arm
  { a: 'left_shoulder', b: 'left_elbow', color: REGION_COLORS.leftArm },
  { a: 'left_elbow', b: 'left_wrist', color: REGION_COLORS.leftArm },
  // right arm
  { a: 'right_shoulder', b: 'right_elbow', color: REGION_COLORS.rightArm },
  { a: 'right_elbow', b: 'right_wrist', color: REGION_COLORS.rightArm },
  // left leg
  { a: 'left_hip', b: 'left_knee', color: REGION_COLORS.leftLeg },
  { a: 'left_knee', b: 'left_ankle', color: REGION_COLORS.leftLeg },
  // right leg
  { a: 'right_hip', b: 'right_knee', color: REGION_COLORS.rightLeg },
  { a: 'right_knee', b: 'right_ankle', color: REGION_COLORS.rightLeg },
];

const JOINT_COLORS: Record<string, string> = {
  nose: REGION_COLORS.face,
  left_eye: REGION_COLORS.face,
  right_eye: REGION_COLORS.face,
  left_ear: REGION_COLORS.face,
  right_ear: REGION_COLORS.face,
  neck: REGION_COLORS.spine,
  spine_mid: REGION_COLORS.spine,
  mid_hip: REGION_COLORS.spine,
  left_shoulder: REGION_COLORS.leftArm,
  left_elbow: REGION_COLORS.leftArm,
  left_wrist: REGION_COLORS.leftArm,
  right_shoulder: REGION_COLORS.rightArm,
  right_elbow: REGION_COLORS.rightArm,
  right_wrist: REGION_COLORS.rightArm,
  left_hip: REGION_COLORS.leftLeg,
  left_knee: REGION_COLORS.leftLeg,
  left_ankle: REGION_COLORS.leftLeg,
  right_hip: REGION_COLORS.rightLeg,
  right_knee: REGION_COLORS.rightLeg,
  right_ankle: REGION_COLORS.rightLeg,
};

const MAJOR_JOINTS = new Set(['neck', 'spine_mid', 'mid_hip', 'left_shoulder', 'right_shoulder', 'left_hip', 'right_hip']);
const FACE_JOINTS = new Set(['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear']);

export function jointColor(name: string): string {
  return JOINT_COLORS[name] ?? REGION_COLORS.spine;
}

/** Visual + hit-test radius in pixels — bigger for major joints, smaller for face points. */
export function jointRadius(name: string): number {
  if (MAJOR_JOINTS.has(name)) return 6;
  if (FACE_JOINTS.has(name)) return 3;
  return 4.5;
}

/**
 * Finds the closest joint to a pointer position, for "snap to joint" — lets
 * a coach precisely circle a specific point instead of eyeballing it.
 * Returns null if nothing is within maxDistPx.
 */
export function findNearestJoint(
  keypoints: Map<string, NamedPoint>,
  pxX: number,
  pxY: number,
  width: number,
  height: number,
  maxDistPx: number,
): { name: string; x: number; y: number } | null {
  let best: { name: string; x: number; y: number; dist: number } | null = null;
  for (const [name, kp] of keypoints) {
    if (kp.score < 0.3) continue;
    const x = kp.x * width;
    const y = kp.y * height;
    const dist = Math.hypot(x - pxX, y - pxY);
    if (dist <= maxDistPx && (!best || dist < best.dist)) {
      best = { name, x: kp.x, y: kp.y, dist };
    }
  }
  return best ? { name: best.name, x: best.x, y: best.y } : null;
}
