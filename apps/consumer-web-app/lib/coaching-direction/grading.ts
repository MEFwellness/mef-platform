/**
 * Adaptive Coaching Direction, Part 3 — the grading math. Pure, no I/O, so
 * what Root concludes about an approach is directly unit-testable against a
 * ledger fixture with no database involved, the same draft/service split
 * every other engine in this codebase uses.
 *
 * WHAT THIS IS.
 *   Counting and comparing. For each kind of action Root has delivered, and
 *   for each continuing thread, it counts what the outcome ledger recorded
 *   and reads what the before/after comparison primitive reported. That is
 *   the whole of it.
 *
 * WHAT THIS IS NOT.
 *   Not an intelligence layer. It computes no correlation, no driver state,
 *   no tier and no score. Every number it reads was recorded by Part 1 or
 *   published by the analytics service layer.
 *   Not an interpretation. It may say "she acted on 4 of the 6 reset
 *   actions Root delivered, and her activity in the fortnight after them
 *   differed from the fortnight before". It may never say why, and it may
 *   never say whether the difference was good. The comparison primitive's
 *   own header (lib/analytics-service/comparison.ts) draws that line and
 *   this file stays behind it.
 *
 * EVIDENCE SUFFICIENCY IS NOT THIS FILE'S TO INVENT. It calls the friction
 * signals service's own `evidenceSufficiency` rather than restating its
 * thresholds, so a grade and a friction signal built on the same amount of
 * behavior can never disagree about how much that is. That function's
 * 'low' is renamed 'thin' here and nowhere else, because 'thin' is the word
 * the weekly review and the Part 2 review shape already use for the same
 * idea.
 */

import { evidenceSufficiency } from '../analytics-service/friction';
import { compareWindows } from '../analytics-service/comparison';
import type { MemberWindowComparison } from '../analytics-service/types';
import type { CoachingActionType, MemberResponse } from './types';

// ---------------------------------------------------------------------
// The vocabulary.
// ---------------------------------------------------------------------

/**
 * The two things a grade can be about.
 *
 *   'action_type'  does this KIND of ask land for her. The scope the daily
 *                  engine's preference layer reads, because the thing it
 *                  chooses between inside a rung is a kind of action.
 *   'thread'       did this ONE continuing conversation land.
 */
export const GRADE_SCOPES = ['action_type', 'thread'] as const;

export type GradeScope = (typeof GRADE_SCOPES)[number];

export function isGradeScope(value: unknown): value is GradeScope {
  return typeof value === 'string' && (GRADE_SCOPES as readonly string[]).includes(value);
}

/**
 * The four verdicts, and the three the brief asks for plus the ordinary
 * state.
 *
 *   'landing'           she acted on it, and a completed comparison window
 *                       reported movement afterwards.
 *   'landed_no_change'  she acted on it, comparisons ran, and nothing moved
 *                       past the threshold. A real and useful answer: the
 *                       approach reaches her and has not yet changed what
 *                       she does.
 *   'dead'              it reached her repeatedly and she acted on none of
 *                       it.
 *   'neutral'           not enough either way. Most grades, most of the
 *                       time, and the only honest default.
 */
export const GRADE_VERDICTS = ['landing', 'landed_no_change', 'dead', 'neutral'] as const;

export type GradeVerdict = (typeof GRADE_VERDICTS)[number];

export function isGradeVerdict(value: unknown): value is GradeVerdict {
  return typeof value === 'string' && (GRADE_VERDICTS as readonly string[]).includes(value);
}

/** The friction service's three levels, with its 'low' named 'thin' here. */
export const GRADE_EVIDENCE_LEVELS = ['thin', 'moderate', 'strong'] as const;

export type GradeEvidenceLevel = (typeof GRADE_EVIDENCE_LEVELS)[number];

export function isGradeEvidenceLevel(value: unknown): value is GradeEvidenceLevel {
  return typeof value === 'string' && (GRADE_EVIDENCE_LEVELS as readonly string[]).includes(value);
}

/** What a completed before/after comparison reported for one decision. */
export const COMPARISON_OUTCOMES = ['moved', 'flat', 'out_of_scope'] as const;

export type ComparisonOutcome = (typeof COMPARISON_OUTCOMES)[number];

export function isComparisonOutcome(value: unknown): value is ComparisonOutcome {
  return typeof value === 'string' && (COMPARISON_OUTCOMES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------
// Thresholds. Every one is named, and every one is documented where it is
// applied rather than only where it is declared.
// ---------------------------------------------------------------------

/**
 * Acted-on deliveries required before an approach can be called landing or
 * landed-but-flat. One is an anecdote; the guardrails in Part 1 already
 * move on three consecutive days, so two acted-on days is the smallest
 * number that is a pattern rather than a single good morning.
 */
export const ACTED_MINIMUM_FOR_LANDING = 2;

/**
 * Deliveries she genuinely SAW and did not act on before an approach is
 * dead. Three, matching Part 1's own IGNORES_BEFORE_APPROACH_CHANGE: the
 * point at which that build already decided Root should stop asking the
 * same way is the same point at which the grader may say it is not landing.
 */
export const UNACTED_MINIMUM_FOR_DEAD = 3;

/**
 * How long a dead grade stands before it returns to neutral.
 *
 * Straight from the brief, and it is the single most important number in
 * this file. Without it, one bad fortnight would retire a kind of support
 * for good, and a member who changed would never be offered it again. With
 * it, Root stops for three weeks and then carefully tries once more.
 */
export const DEAD_GRADE_DECAY_DAYS = 21;

/**
 * How far back a grading pass reads the ledger.
 *
 * Bounded for the same reason listUnresolvedDecisions is: a decision from
 * four months ago tells the preference layer nothing useful about who she
 * is now, and reading all of history would make a pass that must be cheap
 * grow without limit.
 */
export const GRADE_LOOKBACK_DAYS = 90;

/**
 * The relative change at which a behavioral metric counts as having moved.
 *
 * Twenty percent, direction-agnostic. A member who went from four active
 * days to five has not moved; one who went from four to six has. Going from
 * zero to anything, or from anything to zero, is always movement, because a
 * ratio cannot express it (see compareWindows, which returns a null ratio
 * rather than Infinity for exactly that case).
 */
export const MOVED_RELATIVE_CHANGE = 0.2;

/**
 * The metrics a comparison is read on.
 *
 * All four are behavioral, all four come from the comparison primitive's
 * own output, and none of them is a health value. Deliberately a short
 * list: the rate metrics and totalEvents in that primitive's output are
 * derived from these, so including them would count the same movement
 * more than once.
 */
export const COMPARED_METRICS = [
  'activeDays',
  'signIns',
  'dailyResetStarted',
  'dailyResetCompleted',
] as const;

// ---------------------------------------------------------------------
// Reading one comparison.
// ---------------------------------------------------------------------

/**
 * Whether one metric's before/after pair counts as movement.
 *
 * Exported because it is the whole of the "did anything change" judgement
 * and deserves its own tests rather than only being reachable through a
 * full comparison object.
 */
export function metricMoved(before: number | null, after: number | null): boolean {
  if (before === null || after === null) return false;
  if (before === 0) return after > 0;
  if (after === 0) return before > 0;
  return Math.abs(after - before) / before > MOVED_RELATIVE_CHANGE;
}

/**
 * One completed comparison, reduced to the one slug the grade stores.
 *
 * Returns null when the after window has not finished elapsing. That is
 * NOT 'flat': an after window with fewer days of opportunity than the
 * before window will read as a decline whether or not anything declined,
 * which is precisely what that primitive's `afterWindowComplete` flag
 * exists to prevent a caller doing. A caller that gets null here must try
 * again another day rather than record a result.
 */
export function readComparison(comparison: MemberWindowComparison): ComparisonOutcome | null {
  if (!comparison.inScope) return 'out_of_scope';
  if (!comparison.afterWindowComplete) return null;

  const deltas = compareWindows(comparison);
  const considered = new Set<string>(COMPARED_METRICS);
  const moved = deltas
    .filter((delta) => considered.has(delta.metric))
    .some((delta) => metricMoved(delta.before, delta.after));

  return moved ? 'moved' : 'flat';
}

// ---------------------------------------------------------------------
// Grading a set of decisions.
// ---------------------------------------------------------------------

/**
 * One ledger row, reduced to what the grader is allowed to see.
 *
 * Note what is absent: the evidence, the rule's own copy, the approach, and
 * the reason line. A grade is a fact about whether a kind of ask landed. It
 * has no business reading what the ask was about.
 */
export type GradeableDecision = {
  localDate: string;
  actionType: CoachingActionType;
  threadKey: string;
  memberResponse: MemberResponse | null;
  comparisonOutcome: ComparisonOutcome | null;
};

/** One computed grade, before it is written to a row. */
export type CoachingGrade = {
  scope: GradeScope;
  key: string;
  actionType: CoachingActionType;
  deliveredCount: number;
  actedCount: number;
  /**
   * The brief's own definition: later plus ignored plus not_seen. Stored as
   * asked, and deliberately NOT what the dead verdict is computed from. See
   * `unactedSeen` below and migration 152's own note.
   */
  ignoredCount: number;
  notSeenCount: number;
  comparedCount: number;
  movedCount: number;
  verdict: GradeVerdict;
  evidenceLevel: GradeEvidenceLevel;
  spanDays: number;
  lastDeliveredLocalDate: string | null;
};

/**
 * Deliveries she could actually have responded to.
 *
 * This is the number the 'dead' verdict is computed from, and the reason it
 * exists is Part 1's sharpest design decision: a day the card was never on
 * her screen is not evidence about the card. Counting a fortnight away as
 * fourteen rejections is how an adaptive system becomes one that punishes a
 * member for having a life.
 */
export function seenCount(decisions: readonly GradeableDecision[]): number {
  return decisions.filter((decision) => decision.memberResponse !== 'not_seen').length;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * The whole grade for one scope, from its decisions.
 *
 * Deterministic and total: any set of decisions produces exactly one grade,
 * and an empty set produces a neutral grade on thin evidence rather than
 * nothing, so a caller never has to distinguish "no grade" from "a grade
 * that says nothing".
 */
export function gradeDecisions(
  scope: GradeScope,
  key: string,
  actionType: CoachingActionType,
  decisions: readonly GradeableDecision[]
): CoachingGrade {
  const delivered = decisions.length;
  const acted = decisions.filter(
    (decision) => decision.memberResponse === 'done' || decision.memberResponse === 'help'
  ).length;
  const notSeen = decisions.filter((decision) => decision.memberResponse === 'not_seen').length;
  // The brief's aggregate: everything that was not an act.
  const ignored = decisions.filter(
    (decision) =>
      decision.memberResponse === 'later' ||
      decision.memberResponse === 'ignored' ||
      decision.memberResponse === 'not_seen'
  ).length;

  // What the dead verdict actually reads: she saw it and did not take it up.
  const unactedSeen = seenCount(decisions) - acted;

  const outcomes = decisions
    .map((decision) => decision.comparisonOutcome)
    .filter((outcome): outcome is ComparisonOutcome => outcome === 'moved' || outcome === 'flat');
  const compared = outcomes.length;
  const moved = outcomes.filter((outcome) => outcome === 'moved').length;

  const dates = decisions.map((decision) => decision.localDate).sort();
  const first = dates[0] ?? null;
  const last = dates[dates.length - 1] ?? null;
  const spanDays = first && last ? daysBetween(first, last) + 1 : 0;

  // The level comes from the friction service's own function, over the
  // deliveries she could have responded to and the span they covered.
  // 'low' is this build's 'thin'; the thresholds are not restated here.
  const level = evidenceSufficiency(seenCount(decisions), spanDays).level;
  const evidenceLevel: GradeEvidenceLevel = level === 'low' ? 'thin' : level;

  return {
    scope,
    key,
    actionType,
    deliveredCount: delivered,
    actedCount: acted,
    ignoredCount: ignored,
    notSeenCount: notSeen,
    comparedCount: compared,
    movedCount: moved,
    verdict: verdictFor({ acted, unactedSeen, compared, moved }),
    evidenceLevel,
    spanDays,
    lastDeliveredLocalDate: last,
  };
}

/**
 * The verdict, from four counts and nothing else.
 *
 * Order matters and is stated as a ladder rather than as nested branches:
 * an approach that has been acted on is never dead, however many other days
 * she let pass, because the acts happened.
 */
export function verdictFor(counts: {
  acted: number;
  unactedSeen: number;
  compared: number;
  moved: number;
}): GradeVerdict {
  if (counts.acted >= ACTED_MINIMUM_FOR_LANDING && counts.moved >= 1) return 'landing';
  if (counts.acted >= ACTED_MINIMUM_FOR_LANDING && counts.compared >= 1) return 'landed_no_change';
  if (counts.acted === 0 && counts.unactedSeen >= UNACTED_MINIMUM_FOR_DEAD) return 'dead';
  return 'neutral';
}

// ---------------------------------------------------------------------
// Decay.
// ---------------------------------------------------------------------

/** Days since this scope was last delivered, or null when it never was. */
export function daysSinceLastDelivered(
  grade: Pick<CoachingGrade, 'lastDeliveredLocalDate'>,
  todayLocalDate: string
): number | null {
  if (!grade.lastDeliveredLocalDate) return null;
  return daysBetween(grade.lastDeliveredLocalDate, todayLocalDate);
}

/**
 * A dead grade whose type has not been delivered for 21 days.
 *
 * Named as its own predicate because two different callers need it for two
 * different reasons: the preference layer needs it to stop deprioritizing,
 * and the weekly review needs it to say Root is trying something again
 * rather than that it has retired it.
 */
export function isDecayedDeadGrade(
  grade: Pick<CoachingGrade, 'verdict' | 'lastDeliveredLocalDate'>,
  todayLocalDate: string
): boolean {
  if (grade.verdict !== 'dead') return false;
  const days = daysSinceLastDelivered(grade, todayLocalDate);
  return days !== null && days >= DEAD_GRADE_DECAY_DAYS;
}

/**
 * The verdict as of today, with decay applied.
 *
 * Decay is applied at READ time rather than by rewriting the row, and that
 * is deliberate. The row records what the ledger showed when it was
 * computed, which is a fact and does not become false with time. Whether
 * Root should still be acting on it is a question about today, and asking
 * it here means no scheduled job has to exist for a grade to expire on the
 * right day.
 */
export function effectiveVerdict(
  grade: Pick<CoachingGrade, 'verdict' | 'lastDeliveredLocalDate'>,
  todayLocalDate: string
): GradeVerdict {
  return isDecayedDeadGrade(grade, todayLocalDate) ? 'neutral' : grade.verdict;
}
