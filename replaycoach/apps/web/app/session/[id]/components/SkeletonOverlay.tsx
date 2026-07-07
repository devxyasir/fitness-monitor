'use client';

import { useEffect, useRef } from 'react';
import { usePoseStore } from '../../../../stores/pose-store';
import { keypointNamesFor, skeletonConnectionsFor, type KeypointFormat } from '@replaycoach/types';

// Limb color palette for visual distinction
const LIMB_COLORS: Record<string, string> = {
  face: '#A78BFA',       // violet
  leftArm: '#34D399',    // emerald
  rightArm: '#60A5FA',   // blue
  torso: '#FBBF24',      // amber
  leftLeg: '#F87171',    // red
  rightLeg: '#FB923C',   // orange
};

function getLimbColorByName(nameA: string, nameB: string): string {
  const isLeft = (n: string) => n.startsWith('left_') || n.includes('_left');
  const isFace = (n: string) => ['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear', 'head', 'neck'].includes(n);
  
  if (isFace(nameA) || isFace(nameB)) return LIMB_COLORS['face']!;
  if (nameA === 'neck' || nameA === 'pelvis' || nameB === 'neck' || nameB === 'pelvis') return LIMB_COLORS['torso']!;
  if (nameA.includes('shoulder') && nameB.includes('shoulder')) return LIMB_COLORS['torso']!;
  if (nameA.includes('hip') && nameB.includes('hip')) return LIMB_COLORS['torso']!;
  
  if (nameA.includes('shoulder') || nameA.includes('elbow') || nameA.includes('wrist')) {
    return isLeft(nameA) ? LIMB_COLORS['leftArm']! : LIMB_COLORS['rightArm']!;
  }
  if (nameA.includes('hip') || nameA.includes('knee') || nameA.includes('ankle') || nameA.includes('toe') || nameA.includes('heel')) {
    return isLeft(nameA) ? LIMB_COLORS['leftLeg']! : LIMB_COLORS['rightLeg']!;
  }
  return LIMB_COLORS['torso']!;
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
 * SkeletonOverlay — draws RTMPose COCO-17 or Halpe-26 keypoints and skeleton
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

    // Determine format dynamically based on frame keypoints length or names
    const isHalpe = keypoints.length === 26 || keypoints.some(kp => ['head', 'left_heel'].includes(kp.name));
    const format: KeypointFormat = isHalpe ? 'halpe26' : 'coco17';
    const names = keypointNamesFor(format);
    const connections = skeletonConnectionsFor(format);

    const orderedKps = names.map((name) => kpMap.get(name));

    // Draw skeleton connections (limbs) — clean, thin lines.
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i]!;
      const kpA = orderedKps[conn[0]];
      const kpB = orderedKps[conn[1]];

      if (!kpA || !kpB) continue;
      if (kpA.score < 0.3 || kpB.score < 0.3) continue;

      const nameA = names[conn[0]]!;
      const nameB = names[conn[1]]!;
      ctx.strokeStyle = getLimbColorByName(nameA, nameB);
      ctx.globalAlpha = Math.min(kpA.score, kpB.score);
      ctx.beginPath();
      ctx.moveTo(kpA.x * width, kpA.y * height);
      ctx.lineTo(kpB.x * width, kpB.y * height);
      ctx.stroke();
    }

    // Draw keypoints as thin HOLLOW rings — a real open circle with clear
    // space inside (radius well above the 1.25px stroke), consistent size
    // across the skeleton. A thin dark ring just outside gives contrast on
    // any background while the interior stays empty.
    ctx.globalAlpha = 1.0;
    const JOINT_RADIUS = 6;
    for (let i = 0; i < orderedKps.length; i++) {
      const kp = orderedKps[i];
      if (!kp || kp.score < 0.3) continue;

      const px = kp.x * width;
      const py = kp.y * height;

      ctx.lineWidth = 1.25;
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
