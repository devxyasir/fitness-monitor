'use client';

import { useEffect, useRef } from 'react';
import { usePoseStore } from '../../../../stores/pose-store';
import { COCO_SKELETON_CONNECTIONS } from '@replaycoach/types';

// Limb color palette for visual distinction
const LIMB_COLORS: Record<string, string> = {
  face: '#A78BFA',       // violet
  leftArm: '#34D399',    // emerald
  rightArm: '#60A5FA',   // blue
  torso: '#FBBF24',      // amber
  leftLeg: '#F87171',    // red
  rightLeg: '#FB923C',   // orange
};

function getLimbColor(i: number): string {
  if (i <= 1) return LIMB_COLORS['face']!;
  if (i <= 3) return LIMB_COLORS['face']!;
  if (i === 4) return LIMB_COLORS['torso']!;
  if (i <= 6) return LIMB_COLORS['leftArm']!;
  if (i <= 8) return LIMB_COLORS['rightArm']!;
  if (i <= 10) return LIMB_COLORS['torso']!;
  if (i === 11) return LIMB_COLORS['torso']!;
  if (i <= 13) return LIMB_COLORS['leftLeg']!;
  return LIMB_COLORS['rightLeg']!;
}

interface SkeletonOverlayProps {
  /** Session context for filtering pose updates */
  sessionId: string;
  /** Which participant's skeleton to render */
  participantId: string;
  /** Canvas width in pixels */
  width: number;
  /** Canvas height in pixels */
  height: number;
}

/**
 * SkeletonOverlay — draws RTMPose COCO-17 keypoints and skeleton
 * connections on a transparent canvas layer positioned over a video tile.
 *
 * Renders imperatively for performance (no React reconciliation per frame).
 * Degrades gracefully: if pose data disappears, canvas simply clears.
 */
export function SkeletonOverlay({
  sessionId,
  participantId,
  width,
  height,
}: SkeletonOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Subscribe to the pose store for this participant's frame
  const frame = usePoseStore((state) => state.frames[participantId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ensure canvas dimensions match props
    canvas.width = width;
    canvas.height = height;

    // Clear previous frame
    ctx.clearRect(0, 0, width, height);

    if (!frame || !frame.keypoints || frame.keypoints.length === 0) {
      return; // Graceful degradation — no data, no overlay
    }

    const keypoints = frame.keypoints;

    // Build a lookup map from keypoint name → {x, y, score}
    const kpMap = new Map<string, { x: number; y: number; score: number }>();
    for (const kp of keypoints) {
      kpMap.set(kp.name, { x: kp.x, y: kp.y, score: kp.score });
    }

    // Build an ordered array for connection indexing (COCO-17 order)
    const COCO_NAMES = [
      'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
      'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
      'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
      'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
    ];

    const orderedKps = COCO_NAMES.map((name) => kpMap.get(name));

    // Draw skeleton connections (limbs) — clean, thin lines.
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    for (let i = 0; i < COCO_SKELETON_CONNECTIONS.length; i++) {
      const conn = COCO_SKELETON_CONNECTIONS[i]!;
      const kpA = orderedKps[conn[0]];
      const kpB = orderedKps[conn[1]];

      if (!kpA || !kpB) continue;
      if (kpA.score < 0.3 || kpB.score < 0.3) continue;

      ctx.strokeStyle = getLimbColor(i);
      ctx.globalAlpha = Math.min(kpA.score, kpB.score);
      ctx.beginPath();
      ctx.moveTo(kpA.x * width, kpA.y * height);
      ctx.lineTo(kpB.x * width, kpB.y * height);
      ctx.stroke();
    }

    // Draw keypoints as thin OUTLINED circles (not filled dots) — a
    // consistent size across the whole skeleton, professional replay look.
    // A subtle dark ring under the colored ring gives contrast on any
    // background without the heaviness of a filled dot.
    ctx.globalAlpha = 1.0;
    const JOINT_RADIUS = 4;
    for (let i = 0; i < orderedKps.length; i++) {
      const kp = orderedKps[i];
      if (!kp || kp.score < 0.3) continue;

      const px = kp.x * width;
      const py = kp.y * height;

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)'; // slate-900 contrast ring
      ctx.beginPath();
      ctx.arc(px, py, JOINT_RADIUS + 1, 0, Math.PI * 2);
      ctx.stroke();

      // Single consistent joint color reads cleaner over the colored limbs.
      ctx.strokeStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(px, py, JOINT_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [frame, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
      }}
    />
  );
}
