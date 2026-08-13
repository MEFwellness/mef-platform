/**
 * The Weekly Root Review — the composer. Pure, no I/O, deterministic, no
 * LLM, exactly like Part 1's selection engine and for the same reason: what
 * Root says about a member's week must be directly unit-testable against a
 * fixture, with no database and no model involved.
 *
 * IT COMPUTES NOTHING. Every judgement it appears to make was made
 * somewhere else and is read here:
 *
 *   which direction a metric moved      member_pattern_states, already
 *                                       classified by lib/intelligence/
 *                                       trendEngine.ts and already tiered by
 *                                       lib/longitudinal-intelligence/
 *                                       signalState.ts
 *   whether the picture is mixed        that module's 'conflicting' state
 *   whether a behavior is stuck         the friction signals service's own
 *                                       thresholds, read through Part 1's
 *                                       own read path
 *   how the plan week went              the Reset Plan's own weekly
 *                                       classification
 *   what she did about Root's actions   the Part 1 outcome ledger
 *
 * The composer's only real jobs are: decide whether there is enough behind
 * her to observe anything at all, choose WHICH of the available
 * observations are worth the two to four slots, decide whether the week has
 * earned a question, and pick one focus for the coming week.
 *
 * NON-VACUITY IS BUILT IN. A candidate observation is kept only if
 * ./copy.ts can actually render it from the numbers the plan will store, so
 * a stored plan can never contain an observation that renders as nothing.
 * That is checked here rather than at render time because a review with one
 * visible line would silently violate the two-to-four rule.
 */

import type { CoachingActionType, MemberResponse } from '../coaching-direction/types';
import { daysSinceLastDelivered } from '../coaching-direction/grading';
import type { CoachingGrade } from '../coaching-direction/grading';
import type { LongitudinalSignal } from '../longitudinal-intelligence/types';
import type { BehavioralFrictionInput } from '../priority/types';
import { frictionActionType } from '../priority/select';
import type { Signal } from '../life-signal-check/constants';
import type { WellnessMetricKey } from '../wellness/wellness-index';
import { metricKeyFromSignalKey, renderObservation, renderWorked } from './copy';
import {
  MAX_OBSERVATIONS,
  MAX_QUESTIONS,
  MIN_FULL_OBSERVATIONS,
  sanitizeFocusEvidence,
  sanitizeMetrics,
} from './plan';
import type { QuestionKey } from './questions';
import { isBiasableFocus } from './focus';
import { daysBetween, reviewedRangeFor, withinRange } from './week';
import {
  MIN_HISTORY_DAYS_FOR_FULL_REVIEW as HISTORY_FLOOR,
  MIN_RESETS_FOR_FULL_REVIEW as RESETS_FLOOR,
} from './types';
import type {
  FocusReason,
  ReviewGrade,
  ReviewObservation,
  ReviewPlan,
  ReviewShape,
  ReviewWorked,
  WeekFocus,
} from './types';

// ---------------------------------------------------------------------
// The thin-data line.
// ---------------------------------------------------------------------

/**
 * The two thin-data thresholds, declared in ./types.ts (see the note there
 * on why) and re-exported here, where they are actually applied, so every
 * existing importer and every test keeps reading them from one place.
 */
export {
  MIN_HISTORY_DAYS_FOR_FULL_REVIEW,
  MIN_RESETS_FOR_FULL_REVIEW,
} from './types';

/**
 * Days of history, defined as the span from her FIRST Daily Reset to the
 * last day of the week being reviewed, inclusive.
 *
 * Deliberately measured from her first Daily Reset rather than from account
 * creation. An account that existed for a year with nothing in it has no
 * history for Root to read, and treating it as a year of history would let
 * a full review be composed over almost nothing.
 */
export function historyDaysFor(checkinLocalDates: readonly string[], weekStart: string): number {
  if (checkinLocalDates.length === 0) return 0;
  const first = [...checkinLocalDates].sort()[0]!;
  const { to } = reviewedRangeFor(weekStart);
  return Math.max(0, daysBetween(first, to) + 1);
}

// ---------------------------------------------------------------------
// The composer's inputs.
// ---------------------------------------------------------------------

/** One outcome ledger row, reduced to what the composer is allowed to see. */
export type ReviewDecision = {
  localDate: string;
  rule: string;
  actionType: CoachingActionType;
  threadKey: string;
  memberResponse: MemberResponse | null;
};

/** This week's Reset Plan logs, already classified by the plan's own rules. */
export type ReviewPlanWeek = {
  focusSignal: Signal;
  /** The Reset Plan's own ResetPlanDay7Pattern slug for this week. */
  pattern: string;
  normalCount: number;
  difficultCount: number;
  notTodayCount: number;
  loggedCount: number;
};

export type WeeklyReviewInputs = {
  /** Her own local Monday. The review looks back at the seven days before it. */
  weekStart: string;
  /** Every Daily Reset local date she has, in any order. All-time. */
  checkinLocalDates: readonly string[];
  /** The Part 1 outcome ledger, any range; the composer filters to the reviewed week itself. */
  decisions: readonly ReviewDecision[];
  /** member_pattern_states, already classified and already tiered. Never re-tiered here. */
  patternStates: readonly LongitudinalSignal[];
  /** This week on her active Reset Plan, or null when she has no active plan. */
  planWeek: ReviewPlanWeek | null;
  /** Part 1's own friction read, or null. */
  friction: BehavioralFrictionInput | null;
  /**
   * Part 3's approach grades, exactly as that module computed them. Never
   * re-graded here. An empty list, which is what a member with no ledger
   * history and every member before migration 152 has, means the review
   * says nothing about grades at all.
   */
  grades?: readonly CoachingGrade[];
  /**
   * Today, in her own timezone. Needed only to age a dead grade: the 21 day
   * decay is what tells "Root is retiring this" apart from "Root is going
   * to try this again", and both are statements about today rather than
   * about the week being reviewed.
   */
  todayLocalDate?: string;
};

// ---------------------------------------------------------------------
// Candidate observations.
// ---------------------------------------------------------------------

/**
 * Which action type a metric's direction points at.
 *
 * Deliberately coarse. A metric is not an action, and pretending a mapping
 * from "sleep moved" to a specific thing to do is precise would be the
 * fabricated-precision this whole product's copy rules exist to avoid. The
 * two real buckets are "this is a noticing thing" and "this is a food and
 * water thing".
 *
 * 'movement' is never produced HERE, and that is unchanged by the movement
 * flip. The engine can now emit a movement action, but only when a mapped
 * driver or the enriched fallback names one specific session. A wellness
 * metric moving in a direction names no session and implicates no driver,
 * so turning "movement trended down this week" into a movement focus would
 * be precision this observation does not have. The coarse bucket stands.
 */
export const METRIC_FOCUS_ACTION_TYPE: Record<WellnessMetricKey, CoachingActionType> = {
  sleep: 'reflection',
  stress: 'reflection',
  energy: 'reflection',
  mood: 'reflection',
  pain: 'reflection',
  hydration: 'nutrition',
  digestion: 'nutrition',
  movement: 'reset',
};

function observation(
  kind: ReviewObservation['kind'],
  tier: 1 | 2 | 3 | null,
  signalKey: string | null,
  state: string | null,
  metrics: Record<string, number>
): ReviewObservation {
  return { kind, tier, signalKey, state, metrics: sanitizeMetrics(metrics) };
}

function countResetsInRange(
  checkinLocalDates: readonly string[],
  range: { from: string; to: string }
): number {
  return checkinLocalDates.filter((date) => withinRange(date, range)).length;
}

/**
 * Every observation the week could support, strongest first.
 *
 * The order IS the editorial judgement and it is the only place in this
 * feature where one kind of fact outranks another, so it is stated as data
 * with a reason per rung:
 *
 *   1. conflicting   Root cannot read the week cleanly. Saying so first is
 *                    the honest opening, and it is what earns the question.
 *   2. friction      A specific thing she is stuck on, which Root can make
 *                    smaller. The most actionable thing on the list.
 *   3. plan week     Her own agreed commitment. Hers before Root's.
 *   4. directions    Up to two metric directions, strongest tier first.
 *   5. consistency   The count. Always available, so it would crowd out
 *                    everything above it if it sat higher.
 *   6. engagement    What she did with Root's suggestions. Last because it
 *                    is about Root as much as about her.
 */
export function buildCandidateObservations(inputs: WeeklyReviewInputs): ReviewObservation[] {
  const range = reviewedRangeFor(inputs.weekStart);
  const candidates: ReviewObservation[] = [];

  const conflicting = inputs.patternStates.filter((signal) => signal.state === 'conflicting');
  for (const signal of conflicting.slice(0, 1)) {
    candidates.push(
      observation('pattern_conflicting', signal.tier, signal.signalKey, signal.state, {
        confidence: signal.confidence,
        occurrenceCount: signal.occurrenceCount,
      })
    );
  }

  if (inputs.friction) {
    const friction = inputs.friction;
    candidates.push(
      // The friction service genuinely returns null for counts on the kinds
      // it cannot count (see BehavioralFrictionInput's own doc comment). NaN
      // here is not a value: sanitizeMetrics drops every non-finite number,
      // so an absent count becomes an absent KEY rather than a zero, and a
      // zero would be a claim the source never made.
      observation('friction', 1, friction.signalType, friction.kind, {
        starts: friction.starts ?? Number.NaN,
        completions: friction.completions ?? Number.NaN,
        completionRate: friction.completionRate ?? Number.NaN,
      })
    );
  }

  if (inputs.planWeek) {
    const week = inputs.planWeek;
    candidates.push(
      observation('plan_week', 1, week.focusSignal, week.pattern, {
        normalCount: week.normalCount,
        difficultCount: week.difficultCount,
        notTodayCount: week.notTodayCount,
        loggedCount: week.loggedCount,
      })
    );
  }

  // Directions, strongest tier first then strongest confidence. Only
  // signals the language module already assigned a tier to are eligible,
  // which is the tier limit applied at selection as well as at render.
  const directions = inputs.patternStates
    .filter((signal) => signal.state !== 'conflicting')
    .filter((signal) => signal.tier !== null)
    .filter((signal) => metricKeyFromSignalKey(signal.signalKey) !== null)
    .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || b.confidence - a.confidence)
    .slice(0, 2);

  for (const signal of directions) {
    candidates.push(
      observation('metric_direction', signal.tier, signal.signalKey, signal.state, {
        confidence: signal.confidence,
        occurrenceCount: signal.occurrenceCount,
      })
    );
  }

  candidates.push(
    observation('reset_consistency', 1, null, null, {
      thisWeekResets: countResetsInRange(inputs.checkinLocalDates, range),
      priorWeekResets: countResetsInRange(inputs.checkinLocalDates, {
        from: reviewedRangeFor(range.from).from,
        to: reviewedRangeFor(range.from).to,
      }),
    })
  );

  const weekDecisions = inputs.decisions.filter((decision) => withinRange(decision.localDate, range));
  candidates.push(
    observation('action_engagement', 1, null, null, {
      delivered: weekDecisions.length,
      acted: weekDecisions.filter((d) => d.memberResponse === 'done' || d.memberResponse === 'help')
        .length,
      ignored: weekDecisions.filter((d) => d.memberResponse === 'ignored').length,
      notSeen: weekDecisions.filter((d) => d.memberResponse === 'not_seen').length,
    })
  );

  return candidates;
}

// ---------------------------------------------------------------------
// What worked.
// ---------------------------------------------------------------------

export function buildWorked(inputs: WeeklyReviewInputs): ReviewWorked[] {
  const range = reviewedRangeFor(inputs.weekStart);
  const weekDecisions = inputs.decisions.filter((d) => withinRange(d.localDate, range));
  const actedDecisions = weekDecisions.filter(
    (d) => d.memberResponse === 'done' || d.memberResponse === 'help'
  );

  const actionTypes = new Set(actedDecisions.map((d) => d.actionType));
  const worked: ReviewWorked[] = [];

  if (actedDecisions.length > 0) {
    worked.push({
      kind: 'acted_on_actions',
      // Named only when every action she acted on was the same kind. A
      // mixed week gets no label rather than the label of whichever one
      // happened to be first.
      actionType: actionTypes.size === 1 ? [...actionTypes][0]! : null,
      metrics: sanitizeMetrics({ acted: actedDecisions.length, delivered: weekDecisions.length }),
    });
  }

  if (inputs.planWeek && inputs.planWeek.normalCount + inputs.planWeek.difficultCount > 0) {
    worked.push({
      kind: 'plan_returns',
      actionType: 'reset',
      metrics: sanitizeMetrics({
        normalCount: inputs.planWeek.normalCount,
        difficultCount: inputs.planWeek.difficultCount,
      }),
    });
  }

  const thisWeekResets = countResetsInRange(inputs.checkinLocalDates, range);
  if (thisWeekResets > 0) {
    worked.push({
      kind: 'reset_days',
      actionType: null,
      metrics: sanitizeMetrics({ thisWeekResets }),
    });
  }

  return worked.filter((item) => renderWorked(item) !== null);
}

// ---------------------------------------------------------------------
// Grades — what Part 3's grading loop concluded, said only when it earned
// the right to be said.
// ---------------------------------------------------------------------

/**
 * At most two grades reach a plan, and on most weeks none does.
 *
 * THREE GATES, and all three have to pass:
 *
 *   1. Evidence must not be thin. This is the gate the brief names, and it
 *      is applied here rather than at render time so a thin grade is never
 *      even stored (./plan.ts's sanitizer refuses one too, so it holds for
 *      a row written by any means).
 *   2. Only the action-type scope is spoken. A thread grade names one
 *      specific continuing conversation, and this feature has no vocabulary
 *      for describing what that conversation was about without storing a
 *      label, which is one step from storing a sentence.
 *   3. Only a verdict that says something. 'neutral' is the ordinary state
 *      and there is no honest sentence for it.
 *
 * The two slots are deliberately different questions, so a member can read
 * both in one review without them contradicting each other: WHAT WORKED
 * takes the strongest LANDING grade, and WHAT ROOT IS ADJUSTING takes the
 * strongest DEAD one.
 */
export function buildReviewGrades(inputs: WeeklyReviewInputs): ReviewGrade[] {
  const today = inputs.todayLocalDate;
  const speakable = (inputs.grades ?? [])
    .filter((grade) => grade.scope === 'action_type')
    .filter((grade) => grade.evidenceLevel === 'moderate' || grade.evidenceLevel === 'strong');

  const toReviewGrade = (grade: CoachingGrade): ReviewGrade => ({
    actionType: grade.actionType,
    verdict: grade.verdict,
    evidence: grade.evidenceLevel === 'strong' ? 'strong' : 'moderate',
    metrics: sanitizeMetrics({
      delivered: grade.deliveredCount,
      acted: grade.actedCount,
      moved: grade.movedCount,
      // Frozen at composition on purpose. The plan is rendered all week and
      // a number that aged mid-week would change the sentence under her.
      daysSinceLastDelivered: today
        ? (daysSinceLastDelivered(grade, today) ?? Number.NaN)
        : Number.NaN,
    }),
  });

  const grades: ReviewGrade[] = [];

  const landing = speakable
    .filter((grade) => grade.verdict === 'landing')
    .sort((a, b) => b.actedCount - a.actedCount || b.movedCount - a.movedCount)[0];
  if (landing) grades.push(toReviewGrade(landing));

  const dead = speakable
    .filter((grade) => grade.verdict === 'dead')
    .sort((a, b) => b.deliveredCount - a.deliveredCount)[0];
  if (dead) grades.push(toReviewGrade(dead));

  return grades;
}

// ---------------------------------------------------------------------
// Questions.
// ---------------------------------------------------------------------

/**
 * The two conditions that earn a question, and nothing else. See
 * ./questions.ts for why these two and not others.
 *
 * Both are deliberately narrow, so most weeks return an empty array. The
 * cap is enforced here as well as in the sanitizer.
 */
export function buildQuestionKeys(inputs: WeeklyReviewInputs): QuestionKey[] {
  const keys: QuestionKey[] = [];

  if (inputs.patternStates.some((signal) => signal.state === 'conflicting')) {
    keys.push('mixed_picture');
  }

  const range = reviewedRangeFor(inputs.weekStart);
  const weekDecisions = inputs.decisions.filter((d) => withinRange(d.localDate, range));
  const actedThreads = new Set(
    weekDecisions
      .filter((d) => d.memberResponse === 'done' || d.memberResponse === 'help')
      .map((d) => d.threadKey)
  );
  const ignoredThreads = new Set(
    weekDecisions.filter((d) => d.memberResponse === 'ignored').map((d) => d.threadKey)
  );
  // The same continuing conversation both landed and did not, inside one
  // week. That is genuine ambiguity: the suggestion may be wrong, or the
  // timing may be, and the two lead to opposite adjustments.
  const ambiguous = [...actedThreads].some((thread) => ignoredThreads.has(thread));
  if (ambiguous) keys.push('mixed_response');

  return keys.slice(0, MAX_QUESTIONS);
}

// ---------------------------------------------------------------------
// The coming week's focus.
// ---------------------------------------------------------------------

/**
 * One focus, chosen deterministically, in this order. Every branch names a
 * rule the daily engine is actually allowed to bias, which
 * `isBiasableFocus` re-checks before the focus is returned.
 */
export function chooseWeekFocus(
  inputs: WeeklyReviewInputs,
  shape: ReviewShape,
  observations: readonly ReviewObservation[]
): WeekFocus {
  const range = reviewedRangeFor(inputs.weekStart);
  const thisWeekResets = countResetsInRange(inputs.checkinLocalDates, range);

  const build = (
    actionType: CoachingActionType | null,
    threadKey: string | null,
    reason: FocusReason,
    evidence: Record<string, unknown>
  ): WeekFocus => ({
    weekStart: inputs.weekStart,
    actionType,
    threadKey,
    reason,
    sourceEvidence: sanitizeFocusEvidence(evidence),
  });

  // A thin review has one honest focus, and it is the same one its own
  // "single most useful thing" names. Anything more specific would be a
  // claim about data Root does not have.
  if (shape === 'thin') {
    return build('reset', null, 'thin_history', { thisWeekResets });
  }

  // 1) A stuck behavior. The most actionable thing available, and the one
  // whose thread the engine can genuinely prefer next week.
  if (inputs.friction) {
    const kind = inputs.friction.kind;
    return build(frictionActionType(kind), `behavioral_friction::${kind}`, 'friction_repeated', {
      frictionKind: kind,
      signalKey: inputs.friction.signalType ?? undefined,
      completions: inputs.friction.completions ?? undefined,
      starts: inputs.friction.starts ?? undefined,
    });
  }

  // 2) A direction her own week actually moved, at tier 2 or above. Tier 1
  // is a single observation and is not enough to steer a week by.
  const worsening = observations.find(
    (item) =>
      item.kind === 'metric_direction' &&
      item.state === 'worsening' &&
      item.tier !== null &&
      item.tier >= 2
  );
  const worseningMetric = worsening ? metricKeyFromSignalKey(worsening.signalKey) : null;
  if (worsening && worseningMetric) {
    return build(METRIC_FOCUS_ACTION_TYPE[worseningMetric], null, 'direction_worsening', {
      signalKey: worsening.signalKey ?? undefined,
      metricKey: worseningMetric,
      state: worsening.state ?? undefined,
      tier: worsening.tier ?? undefined,
      confidence: worsening.metrics.confidence,
    });
  }

  const weekDecisions = inputs.decisions.filter((d) => withinRange(d.localDate, range));
  const acted = weekDecisions.filter(
    (d) => d.memberResponse === 'done' || d.memberResponse === 'help'
  );

  // 3) Nothing landed. Root makes next week's ask smaller rather than
  // better, which is the same judgement Part 1's approach-change guardrail
  // makes one day at a time.
  if (weekDecisions.length > 0 && acted.length === 0) {
    return build('reset', null, 'engagement_thin', {
      delivered: weekDecisions.length,
      acted: 0,
    });
  }

  // 4) Something did land. Continue that kind of thing. The most-acted-on
  // kind wins, with the ledger's own chronological order breaking a tie.
  //
  // PREMISE MISMATCH FIXED BY THE MOVEMENT FLIP. This used to drop
  // 'movement' from the count, because the engine could not act on such a
  // focus and an inert focus is worse than a coarser honest one. The engine
  // can now act on it, so dropping it would mean a member who acted on
  // nothing BUT movement sessions got a focus of something she ignored. The
  // filter is gone and the ledger's own counts stand.
  if (acted.length > 0) {
    const counts = new Map<CoachingActionType, number>();
    for (const decision of acted) {
      counts.set(decision.actionType, (counts.get(decision.actionType) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) {
      return build(best[0], null, 'engagement_strong', {
        delivered: weekDecisions.length,
        acted: acted.length,
      });
    }
  }

  // 5) Nothing to go on inside a week that was otherwise full enough to
  // review. Root points at the core loop and says so.
  return build('reset', null, 'engagement_thin', { thisWeekResets });
}

// ---------------------------------------------------------------------
// The composer.
// ---------------------------------------------------------------------

/**
 * The whole review, as a storable plan. Deterministic: the same inputs
 * always produce the same plan, and the same plan always renders the same
 * words.
 */
export function composeWeeklyReview(inputs: WeeklyReviewInputs): ReviewPlan {
  const totalResets = inputs.checkinLocalDates.length;
  const historyDays = historyDaysFor(inputs.checkinLocalDates, inputs.weekStart);

  const thin = totalResets < RESETS_FLOOR || historyDays < HISTORY_FLOOR;

  if (thin) {
    // A thin review carries exactly one observation, and it is the honest
    // statement of what Root has. No manufactured observations, no
    // question, and its focus is the one thing worth doing.
    const single = observation('reset_consistency', 1, null, null, {
      thisWeekResets: totalResets,
      spanDays: historyDays,
    });
    const plan: ReviewPlan = {
      shape: 'thin',
      observations: [single],
      worked: [],
      focus: chooseWeekFocus(inputs, 'thin', [single]),
      questionKeys: [],
    };
    return plan;
  }

  // Only observations ./copy.ts can genuinely render survive, so the plan
  // can never store a line that shows up blank.
  const renderable = buildCandidateObservations(inputs).filter(
    (candidate) => renderObservation(candidate, inputs.weekStart) !== null
  );
  const observations = renderable.slice(0, MAX_OBSERVATIONS);

  // Below the floor there is not enough to call this a full review, so it
  // becomes a thin one rather than a full one with a single line. Reached
  // only if almost every source came up empty for a member who otherwise
  // passed the thin-data line, which is rare but real.
  if (observations.length < MIN_FULL_OBSERVATIONS) {
    const single = observation('reset_consistency', 1, null, null, {
      thisWeekResets: totalResets,
      spanDays: historyDays,
    });
    return {
      shape: 'thin',
      observations: [single],
      worked: [],
      focus: chooseWeekFocus(inputs, 'thin', [single]),
      questionKeys: [],
    };
  }

  const focus = chooseWeekFocus(inputs, 'full', observations);

  // Grades reach a FULL review only. A thin review already says out loud
  // that Root does not have enough yet, and following that with a
  // conclusion about what has been working would contradict it in the same
  // breath. Both thin branches above therefore return before this point.
  const grades = buildReviewGrades(inputs);

  return {
    shape: 'full',
    observations,
    worked: buildWorked(inputs),
    // A focus the engine could not act on is not stored as a focus at all;
    // the fallback is the core loop, which every rung can express.
    focus: isBiasableFocus(focus)
      ? focus
      : {
          weekStart: inputs.weekStart,
          actionType: 'reset',
          threadKey: null,
          reason: 'engagement_thin',
          sourceEvidence: {},
        },
    questionKeys: buildQuestionKeys(inputs),
    // Absent rather than empty when there is nothing to say, so a plan that
    // says nothing about grades is byte-identical to one composed before
    // Part 3 existed.
    ...(grades.length > 0 ? { grades } : {}),
  };
}
