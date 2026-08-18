/**
 * The safety branch: what happens when a member says an exercise hurts.
 *
 * ONE RULE, AND IT IS NOT NEGOTIABLE. Pain or discomfort is answered by
 * STOPPING, never by offering her something else to try. Handing a member
 * a different exercise the moment she reports pain is the app deciding
 * that the pain was about the exercise, and that is a call this product is
 * not in a position to make. So the exercise is marked stopped, she reads
 * a short caring message, her coach is flagged on the surface he already
 * watches, and the report lands in her record. No options, on any screen,
 * from any code path.
 *
 * THE PAIN LOGIC IS HARVESTED, NOT REBUILT. The retired prescription
 * engine already answered "does this fact mean we do not prescribe":
 * lib/prescription-intelligence/constraints.ts turns a pain report into a
 * constraint with a severity, and lib/prescription-intelligence/gate.ts
 * decides whether a set of constraints blocks. Both are used here as they
 * are. A member's spoken report enters that ladder at `blocking`, and the
 * gate's own predicate is what says no. There is no second pain rule in
 * this file, which is the whole point: if the rule ever changes it changes
 * in the place that already owns it.
 *
 * READING HER WORDS. The "Other" box is free text, and it is read for
 * EXACTLY ONE THING: whether it says something in the pain family, so that
 * a member who typed "my knee is killing me" gets the safety branch rather
 * than a list of alternatives. It is not scored, not classified further,
 * not stored anywhere but the feedback row, and never shown back to her.
 *
 * NO EM DASHES, per the house rule.
 */
import { painConstraintFromExerciseReport } from '../../prescription-intelligence/constraints';
import { hasBlockingConstraint } from '../../prescription-intelligence/gate';

/**
 * Words that mean a body is complaining.
 *
 * Deliberately conservative in one direction and generous in the other: a
 * false positive costs her a list of alternatives she did not get, and a
 * false negative costs her a swap into another exercise while something
 * hurts. So anything ambiguous is treated as pain.
 *
 * "uncomfortable" is deliberately ABSENT and "discomfort" is deliberately
 * present. The sheet already offers "Not comfortable doing it" as a
 * preference reason, and a member who typed "uncomfortable" after skipping
 * past that option usually means the same thing she meant by it. The
 * physical sense of discomfort is what "discomfort" carries, and it is the
 * word the pain option itself uses.
 */
const PAIN_FAMILY_PATTERNS: readonly RegExp[] = [
  /\bpain(ful|s)?\b/,
  /\bhurt(s|ing)?\b/,
  /\bache(s|d|y)?\b/,
  /\baching\b/,
  /\bsore(ness)?\b/,
  /\bdiscomfort\b/,
  /\binjur(y|ies|ed)\b/,
  /\bstrain(ed|ing)?\b/,
  /\bsprain(ed)?\b/,
  /\bpinch(ed|ing)?\b/,
  /\btwinge(s)?\b/,
  /\bsharp\b/,
  /\bshooting\b/,
  /\bburning\b/,
  /\bthrob(bing|s)?\b/,
  /\bnumb(ness)?\b/,
  /\btingl(e|es|ing)\b/,
  /\bflare(d|s|.?up)?\b/,
  /\bswollen\b/,
  /\bswelling\b/,
  /\bspasm(s)?\b/,
  /\bcramp(s|ing|ed)?\b/,
];

/**
 * Whether her own words belong to the pain family. Only ever asked of the
 * "Other" box, and only ever to route her to the safety branch.
 */
export function readsAsPain(text: string | null | undefined): boolean {
  const haystack = (text ?? '').toLowerCase();
  if (haystack.trim() === '') return false;
  return PAIN_FAMILY_PATTERNS.some((pattern) => pattern.test(haystack));
}

export interface SafetyDecision {
  /** True when the exercise must be stopped and nothing offered. */
  stop: boolean;
  /** Always false on this branch. Stated as a field so a caller cannot forget which branch it is on. */
  offerAlternatives: boolean;
  /** Her coach is told. Always, on this branch. */
  notifyCoach: boolean;
  /** What her coach's own engine would call this, from the retired prescription engine's own vocabulary. */
  recommendedAlternative: 'coach_review';
}

/**
 * The whole decision, for one reported exercise. Pure, and asserted
 * against the harvested gate rather than against a boolean written here.
 */
export function exerciseSafetyDecision(input: {
  exerciseName: string;
  feedbackId?: string | null;
}): SafetyDecision {
  const constraint = painConstraintFromExerciseReport(input);
  const blocked = hasBlockingConstraint([constraint]);
  return {
    stop: blocked,
    offerAlternatives: false,
    notifyCoach: true,
    recommendedAlternative: 'coach_review',
  };
}
