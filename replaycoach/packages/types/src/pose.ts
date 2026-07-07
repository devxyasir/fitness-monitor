/**
 * Pose Detection types — strictly {keypoints, confidence}.
 * No scoring, quality, or correctness fields (explicit product requirement).
 */

/** Single detected body keypoint in COCO-17 format. */
export interface Keypoint {
  /** Keypoint name, e.g. "nose", "left_shoulder" */
  name: string;
  /** Normalized X coordinate [0, 1] */
  x: number;
  /** Normalized Y coordinate [0, 1] */
  y: number;
  /** Detection confidence score [0, 1] */
  score: number;
}

/** A single frame of detected pose keypoints for one participant. */
export interface PoseFrameDto {
  sessionId: string;
  participantId: string;
  frameTimestampMs: number;
  keypoints: Keypoint[];
  confidenceAvg: number;
}

/** COCO-17 keypoint names in canonical order. */
export const COCO_KEYPOINT_NAMES = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const;

/** COCO-17 skeleton connections as index pairs for drawing limbs. */
export const COCO_SKELETON_CONNECTIONS: [number, number][] = [
  [0, 1], [0, 2],       // nose → eyes
  [1, 3], [2, 4],       // eyes → ears
  [5, 6],               // shoulders
  [5, 7], [7, 9],       // left arm
  [6, 8], [8, 10],      // right arm
  [5, 11], [6, 12],     // torso
  [11, 12],             // hips
  [11, 13], [13, 15],   // left leg
  [12, 14], [14, 16],   // right leg
];

/**
 * Halpe-26 keypoint names in canonical order (RTMPose body7 halpe26 model).
 * Superset of COCO-17: indices 0–16 are identical to COCO, then adds
 * head/neck/pelvis and full feet (heel + big toe + small toe per foot) —
 * the joints dance analysis needs. The first 17 deliberately match COCO so
 * COCO-sourced data stays readable.
 */
export const HALPE26_KEYPOINT_NAMES = [
  'nose',           // 0
  'left_eye',       // 1
  'right_eye',      // 2
  'left_ear',       // 3
  'right_ear',      // 4
  'left_shoulder',  // 5
  'right_shoulder', // 6
  'left_elbow',     // 7
  'right_elbow',    // 8
  'left_wrist',     // 9
  'right_wrist',    // 10
  'left_hip',       // 11
  'right_hip',      // 12
  'left_knee',      // 13
  'right_knee',     // 14
  'left_ankle',     // 15
  'right_ankle',    // 16
  'head',           // 17
  'neck',           // 18
  'pelvis',         // 19  (mmpose calls this "hip"; renamed to avoid clashing with left/right_hip)
  'left_big_toe',   // 20
  'right_big_toe',  // 21
  'left_small_toe', // 22
  'right_small_toe',// 23
  'left_heel',      // 24
  'right_heel',     // 25
] as const;

/** Halpe-26 skeleton connections (index pairs) — adds neck/pelvis spine and
 * per-foot triangles (ankle→heel, ankle→big toe, big toe→small toe) so foot
 * direction/pointe is visible, on top of the COCO limb set. */
export const HALPE26_SKELETON_CONNECTIONS: [number, number][] = [
  // face
  [0, 1], [0, 2], [1, 3], [2, 4], [0, 17],
  // spine: head → neck → pelvis, neck → shoulders, pelvis → hips
  [17, 18], [18, 19], [18, 5], [18, 6], [19, 11], [19, 12],
  // shoulders + hips
  [5, 6], [11, 12],
  // left arm / right arm
  [5, 7], [7, 9], [6, 8], [8, 10],
  // left leg / right leg
  [11, 13], [13, 15], [12, 14], [14, 16],
  // left foot: ankle→heel, ankle→big toe, big toe→small toe
  [15, 24], [15, 20], [20, 22],
  // right foot
  [16, 25], [16, 21], [21, 23],
];

/** Which keypoint format a stored keypoints JSON / video was produced with. */
export type KeypointFormat = 'coco17' | 'halpe26';

/** Keypoint names for a given format, canonical order. */
export function keypointNamesFor(format: KeypointFormat): readonly string[] {
  return format === 'halpe26' ? HALPE26_KEYPOINT_NAMES : COCO_KEYPOINT_NAMES;
}

/** Skeleton connections for a given format. */
export function skeletonConnectionsFor(format: KeypointFormat): [number, number][] {
  return format === 'halpe26' ? HALPE26_SKELETON_CONNECTIONS : COCO_SKELETON_CONNECTIONS;
}
