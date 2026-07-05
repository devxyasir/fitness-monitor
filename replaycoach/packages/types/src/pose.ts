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
