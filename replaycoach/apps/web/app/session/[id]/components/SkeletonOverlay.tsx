'use client';

import { useEffect, useRef } from 'react';
import { usePoseStore } from '../../../../stores/pose-store';
import { keypointNamesFor, skeletonConnectionsFor, type KeypointFormat } from '@replaycoach/types';

// The signature neon skeleton: thin indigo→violet gradient bones with a soft
// violet glow, small glowing joint dots — one look everywhere (hero mock,
// live overlay, analysis modals), not per-limb flat colors.
const SKELETON_INDIGO = '#6366F1';
const SKELETON_VIOLET = '#8B5CF6';
const SKELETON_GLOW = 'rgba(139,92,246,0.75)';

const HEAD_KEYPOINT_NAMES = new Set(['nose', 'head']);

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

    // One gradient spans the whole canvas so every bone reads as part of the
    // same signature skeleton rather than per-limb flat colors.
    const boneGradient = ctx.createLinearGradient(0, 0, width, height);
    boneGradient.addColorStop(0, SKELETON_INDIGO);
    boneGradient.addColorStop(1, SKELETON_VIOLET);

    ctx.lineWidth = 1.75;
    ctx.lineCap = 'round';
    ctx.strokeStyle = boneGradient;
    ctx.shadowColor = SKELETON_GLOW;
    ctx.shadowBlur = 6;

    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i]!;
      const kpA = orderedKps[conn[0]];
      const kpB = orderedKps[conn[1]];

      if (!kpA || !kpB) continue;
      if (kpA.score < 0.3 || kpB.score < 0.3) continue;

      ctx.globalAlpha = Math.min(kpA.score, kpB.score);
      ctx.beginPath();
      ctx.moveTo(kpA.x * width, kpA.y * height);
      ctx.lineTo(kpB.x * width, kpB.y * height);
      ctx.stroke();
    }

    // Small filled glowing joint dots — the head keypoint renders larger as
    // the skeleton's visual anchor, matching the design system signature.
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = SKELETON_VIOLET;
    ctx.shadowColor = SKELETON_GLOW;
    for (let i = 0; i < orderedKps.length; i++) {
      const kp = orderedKps[i];
      if (!kp || kp.score < 0.3) continue;

      const px = kp.x * width;
      const py = kp.y * height;
      const isHead = HEAD_KEYPOINT_NAMES.has(names[i]!);

      ctx.shadowBlur = isHead ? 8 : 4;
      ctx.beginPath();
      ctx.arc(px, py, isHead ? 7 : 2.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
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
