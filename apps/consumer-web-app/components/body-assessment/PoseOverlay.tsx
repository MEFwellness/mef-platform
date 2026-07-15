'use client';

/**
 * Live biomechanical overlay drawn on top of the camera preview during
 * positioning — landmark dots, a skeleton, a vertical plumb-line
 * reference, horizontal shoulder/hip reference lines, and up to two
 * angle labels for the joints most relevant to the current view. Purely
 * a rendering component: every number it draws comes from
 * lib/body-assessment/poseMetrics.ts, computed once in CameraCapture.tsx
 * and passed down, so there is exactly one implementation of "how is a
 * knee angle computed" in the app.
 *
 * Deliberately restrained per the product requirement: this must not
 * cover the member's whole body or make positioning harder, so only a
 * SMALL number of angle labels are shown (not every joint at once), and
 * every low-confidence landmark is faded rather than drawn as if it were
 * a certain reading — an unreliable-looking dot is itself the "don't
 * trust this yet" signal, not just a missing one.
 */

import { useEffect, useRef } from 'react';
import { toCoreLandmarks, type CorePoseLandmarks, type RawPoseLandmark } from '@/lib/body-assessment/poseTypes';
import type { PoseMetrics } from '@/lib/body-assessment/poseMetrics';

export type OverlayTone = 'neutral' | 'warning' | 'success';

export type AngleLabel = {
  /** Normalized [0,1] image-space position for the label/arc. */
  at: { x: number; y: number };
  degrees: number;
};

const TONE_COLOR: Record<OverlayTone, string> = {
  neutral: 'rgba(255,255,255,0.85)',
  warning: 'rgba(251,191,36,0.9)', // amber
  success: 'rgba(52,211,153,0.9)', // emerald
};

const CONFIDENT_VISIBILITY = 0.5;

const SKELETON_CONNECTIONS: [keyof CorePoseLandmarks, keyof CorePoseLandmarks][] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftHip', 'rightHip'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

function visOf(v: number | undefined): number {
  return v ?? 1;
}

export function PoseOverlay({
  landmarks,
  metrics,
  tone,
  angleLabels,
  mirrored,
}: {
  landmarks: CorePoseLandmarks | null;
  metrics: PoseMetrics | null;
  tone: OverlayTone;
  angleLabels: AngleLabel[];
  mirrored: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    function resize() {
      if (!canvas || !container) return;
      const { width, height } = container.getBoundingClientRect();
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks || !metrics) return;

    const W = canvas.width;
    const H = canvas.height;
    const color = TONE_COLOR[tone];
    const toPx = (p: { x: number; y: number }) => ({ x: p.x * W, y: p.y * H });

    // Vertical plumb-line reference, through the ankle midpoint.
    const plumbX = metrics.ankleMid.x * W;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(plumbX, 0);
    ctx.lineTo(plumbX, H);
    ctx.stroke();
    ctx.restore();

    // Horizontal shoulder/hip reference lines.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.5;
    for (const mid of [metrics.shoulderMid, metrics.hipMid]) {
      const y = mid.y * H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();

    // Skeleton lines — only between two confidently-visible points.
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    for (const [a, b] of SKELETON_CONNECTIONS) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (visOf(pa.visibility) < CONFIDENT_VISIBILITY || visOf(pb.visibility) < CONFIDENT_VISIBILITY) continue;
      const { x: x1, y: y1 } = toPx(pa);
      const { x: x2, y: y2 } = toPx(pb);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();

    // Landmark dots — confidence-aware opacity so an unreliable read LOOKS unreliable, not silently accurate.
    const dotKeys: (keyof CorePoseLandmarks)[] = [
      'leftEar',
      'rightEar',
      'leftShoulder',
      'rightShoulder',
      'leftHip',
      'rightHip',
      'leftKnee',
      'rightKnee',
      'leftAnkle',
      'rightAnkle',
    ];
    for (const key of dotKeys) {
      const point = landmarks[key];
      const v = visOf(point.visibility);
      const { x, y } = toPx(point);
      ctx.save();
      ctx.globalAlpha = Math.max(0.15, Math.min(1, v));
      ctx.fillStyle = v >= CONFIDENT_VISIBILITY ? color : 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Up to two angle labels — deliberately capped so positioning guidance never turns into a wall of numbers.
    ctx.save();
    ctx.font = '600 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const label of angleLabels.slice(0, 2)) {
      const { x, y } = toPx(label.at);
      const text = `${Math.round(label.degrees)}°`;
      const metricsText = ctx.measureText(text);
      const paddingX = 6;
      const boxW = metricsText.width + paddingX * 2;
      const boxH = 18;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.roundRect(x - boxW / 2, y - boxH / 2, boxW, boxH, 6);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x, y + 1);
    }
    ctx.restore();
  }, [landmarks, metrics, tone, angleLabels]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0">
      <canvas ref={canvasRef} className={`h-full w-full ${mirrored ? '-scale-x-100' : ''}`} />
    </div>
  );
}

export function landmarksFromRaw(points: RawPoseLandmark[] | null): CorePoseLandmarks | null {
  if (!points) return null;
  return toCoreLandmarks(points);
}
