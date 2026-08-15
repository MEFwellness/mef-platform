/**
 * Which way the member is facing, decided from signals that actually flip
 * when a person turns around.
 *
 * ============================================================
 * THE BUG THIS REPLACES (real-phone testing, 2026-08-15)
 * ============================================================
 * The back-view step used to require the member's FACE LANDMARKS TO STOP
 * BEING VISIBLE: it failed unless the average `visibility` of the nose,
 * both eyes and both ears fell below 0.5. Turning around never satisfied
 * that, so the step looped "Please turn your back to the camera" forever.
 *
 * The reason is how the pose model works. It predicts all 33 landmarks for
 * every detected person whether or not it can actually see them, and its
 * `visibility` score answers "is this point inside the frame and not
 * hidden behind some other object", not "can the camera see this person's
 * face". A person with their back turned is still a whole person in frame,
 * so their face landmarks stay confidently reported.
 *
 * This was confirmed rather than assumed. Running the real model against a
 * drawn figure seen from behind, one with no face drawn on it at all
 * (scripts/audit-facing-landmarks.mjs, which prints these numbers):
 *
 *     nose      visibility 0.960
 *     left eye  visibility 0.946    right eye  visibility 0.954
 *     left ear  visibility 0.939    right ear  visibility 0.957
 *     average                0.951
 *
 * The old check needed that average below 0.5 and got 0.951. It was not a
 * tuning problem: there is no threshold that makes "wait for the face to
 * disappear" work, because the face never disappears.
 *
 * Worse, both back-view failures returned the IDENTICAL sentence, so a
 * member who correctly turned around satisfied the first check and then
 * failed the second with the same words, which is exactly what an endless
 * loop feels like from the outside.
 *
 * ============================================================
 * WHAT IS CHECKED INSTEAD
 * ============================================================
 * PRIMARY, and strong enough on its own: LEFT/RIGHT ORDERING. The model
 * labels landmarks anatomically (the subject's own left and right), so
 * where those land in the frame reverses when the subject turns around.
 * Facing the camera, their left shoulder is on the viewer's right; facing
 * away, it is on the viewer's left. See poseMetrics.ts's
 * shoulderOrderRatio. Shoulders and hips are read independently.
 *
 * SUPPORTING, and never required on its own: FACE VISIBILITY. It does sag
 * when someone turns away, just nowhere near far enough to gate on. It is
 * worth one point when it is low, and costs nothing when it is high, so a
 * confidently-reported face can never block a member who has plainly
 * turned around.
 *
 * The signals are combined into a score rather than ANDed, so no single
 * noisy value can block on its own, and the same score decides both the
 * front and the back view from opposite ends. That construction is what
 * makes it impossible for both views to accept the same pose.
 */

import type { PoseMetrics } from './poseMetrics';
import type { CorePoseLandmarks } from './poseTypes';

/**
 * Below this magnitude the left/right ordering is too small to read a sign
 * off: the subject is close to side-on, or the model is unsure. Expressed
 * as a fraction of body span. Comfortably below what a squared-up front or
 * back view produces (0.15 at the absolute minimum, since poseValidation.ts
 * already requires that much shoulder width before facing is considered at
 * all) and comfortably above the near-zero values a side view gives.
 */
export const MIN_ORDER_MAGNITUDE = 0.05;

/**
 * Face visibility below this is treated as a hint that the member has
 * turned away. Deliberately LENIENT and deliberately only ever additive:
 * the measured value for a genuinely away-facing person is around 0.95, so
 * this hint will usually not fire at all, and nothing depends on it firing.
 */
export const FACE_VISIBILITY_AWAY_HINT = 0.7;

/** Score at or beyond which the direction is called. Reachable from the shoulder ordering alone, by design: that is the signal being trusted. */
export const FACING_DECISION_SCORE = 2;

export type FacingDirection = 'toward' | 'away' | 'ambiguous';

export type FacingSignals = {
  /** Signed shoulder ordering, positive toward the camera. */
  shoulderOrderRatio: number;
  /** Signed hip ordering, positive toward the camera. */
  hipOrderRatio: number;
  /** Mean visibility of nose, eyes and ears. Reported for the record; it is never a requirement. */
  faceVisibility: number;
  /** Points contributed by each signal, positive meaning toward the camera. */
  shoulderPoints: number;
  hipPoints: number;
  facePoints: number;
};

export type FacingResult = {
  /** Positive means facing the camera, negative means facing away, near zero means undecided. */
  score: number;
  direction: FacingDirection;
  signals: FacingSignals;
};

function averageVisibility(points: { visibility?: number }[]): number {
  if (points.length === 0) return 0;
  let total = 0;
  for (const point of points) total += point.visibility ?? 1;
  return total / points.length;
}

/**
 * Reads the facing signals for one frame. Pure, so the whole decision is
 * testable with hand-built landmark sets and no camera.
 */
export function evaluateFacing(core: CorePoseLandmarks, metrics: PoseMetrics): FacingResult {
  const faceVisibility = averageVisibility([
    core.nose,
    core.leftEye,
    core.rightEye,
    core.leftEar,
    core.rightEar,
  ]);

  // Shoulders carry the decisive weight: this is the clearest reversal a
  // turn produces, and it is enough on its own to call the direction.
  const shoulderPoints =
    metrics.shoulderOrderRatio > MIN_ORDER_MAGNITUDE
      ? 2
      : metrics.shoulderOrderRatio < -MIN_ORDER_MAGNITUDE
        ? -2
        : 0;

  // Hips say the same thing independently, but over a narrower, noisier
  // baseline, so they count for less.
  const hipPoints =
    metrics.hipOrderRatio > MIN_ORDER_MAGNITUDE
      ? 1
      : metrics.hipOrderRatio < -MIN_ORDER_MAGNITUDE
        ? -1
        : 0;

  // Supporting only, and one-directional on purpose: a low face visibility
  // is evidence of having turned away, but a high one is NOT evidence of
  // facing the camera, because the model reports a confident face either
  // way. This asymmetry is the whole lesson of the bug above.
  const facePoints = faceVisibility < FACE_VISIBILITY_AWAY_HINT ? -1 : 0;

  const score = shoulderPoints + hipPoints + facePoints;

  const direction: FacingDirection =
    score >= FACING_DECISION_SCORE ? 'toward' : score <= -FACING_DECISION_SCORE ? 'away' : 'ambiguous';

  return {
    score,
    direction,
    signals: {
      shoulderOrderRatio: metrics.shoulderOrderRatio,
      hipOrderRatio: metrics.hipOrderRatio,
      faceVisibility,
      shoulderPoints,
      hipPoints,
      facePoints,
    },
  };
}

/** True when this frame is good enough evidence that the member has their back to the camera. */
export function isFacingAway(result: FacingResult): boolean {
  return result.direction === 'away';
}

/** True when this frame is good enough evidence that the member is facing the camera. */
export function isFacingToward(result: FacingResult): boolean {
  return result.direction === 'toward';
}
