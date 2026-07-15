/**
 * Shared geometry computed once from a single pose-detection frame —
 * every angle/ratio/midpoint that poseValidation.ts (live capture gating),
 * postureMeasurements.ts (stored screening estimates), and PoseOverlay.tsx
 * (the live visual overlay) all need. Centralized here so the same
 * formula for, say, "knee angle" is computed exactly once and reused,
 * rather than three slightly-different reimplementations drifting apart.
 *
 * Everything here is a plain geometric computation on 2D normalized
 * image-space points — there is no biomechanical or clinical claim built
 * into this file. What each value MEANS (a screening estimate, a
 * validation gate, a display label) is entirely the caller's
 * responsibility; see postureMeasurements.ts's docblock for the
 * clinical-boundary wording rules that apply once these numbers are
 * turned into anything member- or practitioner-facing.
 */

import type { CorePoseLandmarks, RawPoseLandmark } from './poseTypes';

export type Point = { x: number; y: number };

function midpoint(a: RawPoseLandmark, b: RawPoseLandmark): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Degrees off vertical for the vector from `from` to `to` (0 = perfectly vertical, 90 = horizontal). */
export function angleFromVertical(from: Point, to: Point): number {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (dx === 0 && dy === 0) return 0;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

/** Degrees off horizontal for the vector from `from` to `to` (0 = perfectly horizontal, 90 = vertical). */
export function angleFromHorizontal(from: Point, to: Point): number {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (dx === 0 && dy === 0) return 0;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Signed angle (degrees) of the line from `a` to `b` relative to horizontal — positive when `b` sits lower than `a`. Used for "which side is higher" (shoulder/hip tilt), where direction matters and angleFromHorizontal's absolute value alone would lose it. */
export function signedLineAngleFromHorizontal(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Interior angle (degrees) at vertex `b`, between rays b->a and b->c — e.g. angleAtVertex(hip, knee, ankle) is the knee's bend angle: ~180° straight, smaller as the knee bends. */
export function angleAtVertex(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  if (mag1 === 0 || mag2 === 0) return 180;
  const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export type PoseMetrics = {
  shoulderMid: Point;
  hipMid: Point;
  kneeMid: Point;
  ankleMid: Point;
  earMid: Point;

  shoulderWidth: number;
  hipWidth: number;
  /** Vertical extent from the higher of head/shoulder top down to the ankles — the same "how much of the frame the body fills" measure poseValidation.ts gates distance on. */
  bodySpan: number;

  torsoAngleFromVertical: number;
  thighAngleFromVertical: number;

  leftKneeAngle: number;
  rightKneeAngle: number;
  leftHipAngle: number;
  rightHipAngle: number;

  /** Signed — positive means the right shoulder (viewer's right / member's left, since the raw frame is unmirrored — see poseValidation.ts's off_center comment) sits lower. */
  shoulderLineAngle: number;
  hipLineAngle: number;

  /** |left.y - right.y| normalized by shoulder/hip width — a scale-independent "how uneven" ratio, not a physical distance. */
  shoulderHeightDiffRatio: number;
  hipHeightDiffRatio: number;

  frontalRatioShoulders: number;
  frontalRatioHips: number;

  /** Ear-visibility asymmetry: 1.0 = both ears equally visible (facing camera), toward 0 = one ear far less visible than the other (head turned/profile). */
  earVisibilityRatio: number;
  /** Signed horizontal offset of the nose from the shoulder-line midpoint, normalized by shoulder width. */
  noseOffsetRatio: number;

  /**
   * |leftShoulder.z - rightShoulder.z| normalized by shoulder width — null
   * when the pose model didn't supply a z estimate for both shoulders.
   * This is deliberately NOT derived from comparing shoulder width to hip
   * width: shoulders are anatomically wider than hips on effectively every
   * body, so a 2D width-ratio comparison would confound "twisted shoulders"
   * with "this person's normal proportions" and false-positive constantly.
   * Depth (how much closer one shoulder is to the camera than the other)
   * is the actual signal for rotation; when the model can't estimate depth
   * confidently, this check should be skipped rather than substituted with
   * a confounded proxy.
   */
  shoulderDepthDiffRatio: number | null;
};

export function computePoseMetrics(core: CorePoseLandmarks): PoseMetrics {
  const shoulderMid = midpoint(core.leftShoulder, core.rightShoulder);
  const hipMid = midpoint(core.leftHip, core.rightHip);
  const kneeMid = midpoint(core.leftKnee, core.rightKnee);
  const ankleMid = midpoint(core.leftAnkle, core.rightAnkle);
  const earMid = midpoint(core.leftEar, core.rightEar);

  const shoulderWidth = Math.abs(core.leftShoulder.x - core.rightShoulder.x);
  const hipWidth = Math.abs(core.leftHip.x - core.rightHip.x);

  const headTop = Math.min(core.nose.y, core.leftEye.y, core.rightEye.y);
  const bodySpan = Math.abs(ankleMid.y - Math.min(headTop, shoulderMid.y));

  const torsoAngleFromVertical = angleFromVertical(shoulderMid, hipMid);
  const thighAngleFromVertical = angleFromVertical(hipMid, kneeMid);

  const leftKneeAngle = angleAtVertex(core.leftHip, core.leftKnee, core.leftAnkle);
  const rightKneeAngle = angleAtVertex(core.rightHip, core.rightKnee, core.rightAnkle);
  const leftHipAngle = angleAtVertex(core.leftShoulder, core.leftHip, core.leftKnee);
  const rightHipAngle = angleAtVertex(core.rightShoulder, core.rightHip, core.rightKnee);

  const shoulderLineAngle = signedLineAngleFromHorizontal(core.leftShoulder, core.rightShoulder);
  const hipLineAngle = signedLineAngleFromHorizontal(core.leftHip, core.rightHip);

  const shoulderHeightDiffRatio =
    shoulderWidth > 1e-4 ? Math.abs(core.leftShoulder.y - core.rightShoulder.y) / shoulderWidth : 0;
  const hipHeightDiffRatio = hipWidth > 1e-4 ? Math.abs(core.leftHip.y - core.rightHip.y) / hipWidth : 0;

  const frontalRatioShoulders = shoulderWidth / Math.max(bodySpan, 1e-4);
  const frontalRatioHips = hipWidth / Math.max(bodySpan, 1e-4);

  const leftEarVis = core.leftEar.visibility ?? 1;
  const rightEarVis = core.rightEar.visibility ?? 1;
  const earVisibilityRatio =
    Math.max(leftEarVis, rightEarVis) > 1e-4
      ? Math.min(leftEarVis, rightEarVis) / Math.max(leftEarVis, rightEarVis)
      : 1;

  const noseOffsetRatio =
    shoulderWidth > 1e-4 ? (core.nose.x - shoulderMid.x) / shoulderWidth : 0;

  const leftShoulderZ = core.leftShoulder.z;
  const rightShoulderZ = core.rightShoulder.z;
  const shoulderDepthDiffRatio =
    leftShoulderZ !== undefined && rightShoulderZ !== undefined && shoulderWidth > 1e-4
      ? Math.abs(leftShoulderZ - rightShoulderZ) / shoulderWidth
      : null;

  return {
    shoulderMid,
    hipMid,
    kneeMid,
    ankleMid,
    earMid,
    shoulderWidth,
    hipWidth,
    bodySpan,
    torsoAngleFromVertical,
    thighAngleFromVertical,
    leftKneeAngle,
    rightKneeAngle,
    leftHipAngle,
    rightHipAngle,
    shoulderLineAngle,
    hipLineAngle,
    shoulderHeightDiffRatio,
    hipHeightDiffRatio,
    frontalRatioShoulders,
    frontalRatioHips,
    earVisibilityRatio,
    noseOffsetRatio,
    shoulderDepthDiffRatio,
  };
}
