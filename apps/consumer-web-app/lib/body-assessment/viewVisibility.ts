/**
 * Which landmarks a given capture view is entitled to expect the model to
 * see, and how confidently.
 *
 * ============================================================
 * WHY PER-VIEW, AND WHY BY PAIR
 * ============================================================
 * "Is the whole body in shot" used to be one fixed rule for every view:
 * the AVERAGE visibility of both knees and both ankles had to clear 0.5.
 * Two things are wrong with that.
 *
 * An average lets one bad reading drag down three good ones. On a SIDE
 * view that is not an edge case, it is the normal state of affairs: the
 * far knee and far ankle are behind the near ones, so the model reports
 * them weakly by definition. Averaging a confidently-seen near leg with a
 * legitimately-occluded far leg produces a number that says "we cannot see
 * the legs" about a perfectly framed member.
 *
 * And a single fixed set ignores that different views occlude different
 * things. What a front view can expect to see is not what a side view can.
 *
 * So: each view declares the landmark PAIRS it should be able to see, and
 * each pair is scored by its BETTER side, which is the side actually
 * facing the camera. The overall score is then the weakest of those pairs,
 * not their average, so one genuinely missing body part still fails the
 * check while a normally-occluded far side does not.
 *
 * ============================================================
 * THE FACE IS NEVER REQUIRED, ON ANY VIEW
 * ============================================================
 * Not on the back view for the obvious reason, and not on the others
 * either. Face-landmark visibility does not mean what it looks like it
 * means: the model reports a nose, eyes and ears at around 0.95 for a
 * person photographed from directly behind with no face in the picture at
 * all (measured, see lib/body-assessment/facing.ts). It is not a usable
 * signal for "can we see this person properly", in either direction, so it
 * is excluded here rather than given a lenient threshold.
 *
 * Shoulders and hips ARE included, on every view. They are the most
 * reliably detected landmarks on a standing body, so including them makes
 * the check meaningfully harder to trip by accident while costing nothing
 * when the body really is in frame.
 */

import type { BodyAssessmentCaptureType } from '@mef/shared-types-contracts';
import type { CorePoseLandmarks } from './poseTypes';

/** A left/right landmark pair, scored by whichever side the camera can actually see. */
export type LandmarkPair = readonly [keyof CorePoseLandmarks, keyof CorePoseLandmarks];

const BODY_PAIRS: readonly LandmarkPair[] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftHip', 'rightHip'],
  ['leftKnee', 'rightKnee'],
  ['leftAnkle', 'rightAnkle'],
];

/**
 * What each standing view requires. Every view asks for the same four
 * pairs, which is deliberate: shoulders, hips, knees and ankles are what
 * "the whole body is in shot" actually means, and none of them is
 * inherently hidden on any of these views. What differs between views is
 * handled by the better-of-pair scoring rather than by different lists,
 * because on a side view it is not that a landmark is missing, it is that
 * one SIDE of each pair is behind the other.
 */
export const REQUIRED_PAIRS_BY_VIEW: Partial<Record<BodyAssessmentCaptureType, readonly LandmarkPair[]>> = {
  front: BODY_PAIRS,
  back: BODY_PAIRS,
  left_side: BODY_PAIRS,
  right_side: BODY_PAIRS,
};

/**
 * The bar the weakest required pair must clear. Lower than the old 0.5
 * because it is now applied to the weakest PAIR rather than to an average
 * that a legitimately-occluded far side was dragging down: the quantity
 * being tested is stricter, so the number can be kinder without weakening
 * the check.
 */
export const MIN_PAIR_VISIBILITY = 0.4;

export type ViewVisibilityResult = {
  /** Visibility of the weakest required pair, judged by that pair's better side. */
  score: number;
  /** Which pair scored worst, for the message and for the record. */
  weakestPair: LandmarkPair | null;
  ok: boolean;
};

function visibilityOf(core: CorePoseLandmarks, key: keyof CorePoseLandmarks): number {
  return core[key].visibility ?? 1;
}

/** Scores how well this view can see the body parts it is entitled to expect. */
export function evaluateViewVisibility(
  core: CorePoseLandmarks,
  captureType: BodyAssessmentCaptureType
): ViewVisibilityResult {
  const pairs = REQUIRED_PAIRS_BY_VIEW[captureType];
  // A view with no declared expectations (movement, walking, custom) is not
  // gated on visibility at all rather than being gated on a guess.
  if (!pairs || pairs.length === 0) return { score: 1, weakestPair: null, ok: true };

  let score = Number.POSITIVE_INFINITY;
  let weakestPair: LandmarkPair | null = null;
  for (const pair of pairs) {
    // The better side is the one facing the camera. The other is allowed
    // to be weak, because on a side view it is supposed to be.
    const best = Math.max(visibilityOf(core, pair[0]), visibilityOf(core, pair[1]));
    if (best < score) {
      score = best;
      weakestPair = pair;
    }
  }

  return { score, weakestPair, ok: score >= MIN_PAIR_VISIBILITY };
}

/** Plain-language name for the body part a pair covers, for the member-facing message. */
export function describePair(pair: LandmarkPair | null): string {
  if (!pair) return 'your body';
  const key = pair[0];
  if (key === 'leftShoulder') return 'your shoulders';
  if (key === 'leftHip') return 'your hips';
  if (key === 'leftKnee') return 'your knees';
  if (key === 'leftAnkle') return 'your feet';
  return 'your body';
}
