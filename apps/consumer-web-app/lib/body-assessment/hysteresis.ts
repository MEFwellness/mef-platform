/**
 * Dead bands and release margins for any check that can fail in two
 * opposite directions.
 *
 * ============================================================
 * THE TWO SEPARATE PROBLEMS THIS SOLVES
 * ============================================================
 * A check like "how much of the frame does the body fill" can complain in
 * two directions, and if the two complaints share a boundary the member
 * gets bounced between them: cross it one way and you are told to move
 * closer, cross it back and you are told to step back, and the correct
 * position is a knife edge you cannot stand on.
 *
 * A DEAD BAND fixes that. The two thresholds are deliberately kept apart,
 * and between them nothing is said at all. That gap is the range the
 * member is meant to end up in, and it has to be wide enough to stand in.
 *
 * A RELEASE MARGIN fixes the other half. Once a check is satisfied,
 * ordinary drift (breathing, a small sway, sensor noise) will keep nudging
 * the reading back and forth across the threshold it just cleared. Without
 * a margin, each of those nudges re-raises an instruction the member has
 * already acted on, which reads as the app changing its mind. So a check
 * that is currently PASSING has to break by an extra margin before it will
 * speak up again. A check that has not been satisfied yet gets no such
 * grace, because there is no progress to protect.
 *
 * Pure, and told what happened last frame rather than remembering it, so
 * the caller keeps the state and this stays testable in isolation. That
 * is the same split poseValidation.ts already uses for
 * `previousSubjectCenter`.
 */

export type BandThresholds = {
  /** Fails as 'below' under this value. */
  failBelow: number;
  /** Fails as 'above' over this value. Must be greater than failBelow, and the gap between them is the dead band. */
  failAbove: number;
  /** How much further past a threshold an ALREADY-PASSING check must go before it fails again. */
  releaseMargin: number;
};

export type BandVerdict = 'below' | 'above' | 'ok';

/**
 * Where `value` sits against a two-sided threshold pair, given whether
 * this check was passing on the previous frame.
 *
 * `wasPassing` is what turns the release margin on. Pass false on the
 * first frame, or whenever the check has not yet been satisfied.
 */
export function bandVerdict(
  value: number,
  thresholds: BandThresholds,
  wasPassing: boolean
): BandVerdict {
  const margin = wasPassing ? thresholds.releaseMargin : 0;
  if (value < thresholds.failBelow - margin) return 'below';
  if (value > thresholds.failAbove + margin) return 'above';
  return 'ok';
}

/**
 * The one-sided form, for a check that only has a wrong direction (a
 * landmark clipping past the bottom edge of the frame, say). Fails when
 * the value goes above the limit, with the same release-margin grace once
 * the check is already satisfied.
 */
export function ceilingVerdict(
  value: number,
  limit: number,
  releaseMargin: number,
  wasPassing: boolean
): boolean {
  return value > limit + (wasPassing ? releaseMargin : 0);
}

/**
 * Which two-directional checks were satisfied on the previous frame.
 * Threaded into validatePoseFrame so an already-cleared check does not
 * re-fail on drift. Every field is optional, and an absent field means
 * "not yet satisfied", which is the safe default for a first frame.
 */
export type PassingChecks = {
  /** Frame fill: how much of the frame height the body occupies. */
  distance?: boolean;
  /** Full-body framing: nothing clipped at the frame edges. */
  framing?: boolean;
  /** Centering: the body's horizontal position in the frame. */
  centering?: boolean;
};

export const NOTHING_PASSING: PassingChecks = {};
