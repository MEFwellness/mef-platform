/**
 * The Weekly Root Review — Root's words, rendered from the plan.
 *
 * Four laws hold everywhere in this file.
 *
 * 1. NOTHING HERE IS STORED. Every function is pure over a stored plan of
 *    keys and numbers, so the review a member reads on Friday is the same
 *    one she read on Monday without a single sentence living in the
 *    database. See ./plan.ts for why that is the privacy boundary rather
 *    than a performance choice.
 *
 * 2. THE LANGUAGE TIER IS NOT THIS FILE'S TO DECIDE. Any observation that
 *    makes a PATTERN claim is rendered by calling
 *    lib/longitudinal-intelligence/copy.ts's own describeSignalForMember,
 *    the same module Part 1 defers to, with the tier the publishing system
 *    assigned. A tier 1 signal therefore cannot come out sounding like a
 *    tier 3 one, because the sentence is not written here at all. An
 *    observation whose tier is missing where the module needs one renders
 *    as NOTHING rather than as hedged filler.
 *
 * 3. NO INSIGHT WITHOUT A QUERY BEHIND IT. Every renderer returns
 *    `string | null` and returns null whenever the plan does not carry the
 *    numbers its sentence would state. The review then has fewer
 *    observations, which is the honest outcome.
 *
 * 4. ROOT NEVER SCOLDS. An absence is stated as what Root HAS, never as a
 *    count of what she missed. There are no streaks, no "you should", no
 *    misses, and no em dashes in anything a member reads.
 *
 * Where a sentence about a given fact already exists somewhere in the
 * product, it is called rather than rewritten: the Reset Plan's own weekly
 * wording (lib/reset-plan/copy.ts), the Priority Card's own friction
 * wording (lib/priority/copy.ts), and the three-tier language module's own
 * signal sentences. A member must never read two drifted descriptions of
 * the same week.
 */

import { describeSignalForMember } from '../longitudinal-intelligence/copy';
import type { LongitudinalSignal, SignalState } from '../longitudinal-intelligence/types';
import { WELLNESS_METRIC_LABEL, type WellnessMetricKey } from '../wellness/wellness-index';
import { resetPlanWeekReflectionFor } from '../reset-plan/copy';
import type { ResetPlanDay7Pattern } from '../reset-plan/copy';
import { SIGNAL_LABEL, type Signal } from '../life-signal-check/constants';
import { buildFrictionReason } from '../priority/copy';
import type { BehavioralFrictionInput, BehavioralFrictionKind } from '../priority/types';
import type { CoachingActionType } from '../coaching-direction/types';
import { QUESTIONS, isQuestionKey } from './questions';
import type {
  RenderedQuestion,
  RenderedReview,
  ReviewObservation,
  ReviewPlan,
  ReviewWorked,
} from './types';

// ---------------------------------------------------------------------
// Chrome.
// ---------------------------------------------------------------------

export const WEEKLY_REVIEW_LABEL = 'Your week with Root';

export const WEEKLY_REVIEW_HEADING_FULL = 'A look back at your week';
export const WEEKLY_REVIEW_HEADING_THIN = 'A short look back';

export const SHOWED_TITLE = 'What this week showed';
export const WORKED_TITLE = 'What worked';
export const ADJUSTING_TITLE = 'What Root is adjusting';

export const WEEKLY_REVIEW_ACKNOWLEDGE_LABEL = 'Got it';

// ---------------------------------------------------------------------
// Small shared helpers.
// ---------------------------------------------------------------------

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

const METRIC_KEYS = new Set<string>(Object.keys(WELLNESS_METRIC_LABEL));

/**
 * The Daily Wellness Index metric behind a pattern state's signal key.
 *
 * Pattern states for check-in metrics are keyed 'checkin_metric::<area>' by
 * lib/longitudinal-intelligence/signalState.ts. Reading the area back out
 * of the key is why the review can name what it observed without ever
 * storing a label: the label comes from WELLNESS_METRIC_LABEL, the same map
 * every other surface in the app uses.
 *
 * Returns null for any key shape or area this build does not recognise,
 * which renders as no observation rather than as a guess.
 */
export function metricKeyFromSignalKey(signalKey: string | null): WellnessMetricKey | null {
  if (!signalKey) return null;
  const [prefix, area] = signalKey.split('::');
  if (prefix !== 'checkin_metric' || !area) return null;
  return METRIC_KEYS.has(area) ? (area as WellnessMetricKey) : null;
}

/** The Reset Plan focus signal behind a plan_week observation's key. */
function signalFromKey(signalKey: string | null): Signal | null {
  if (!signalKey) return null;
  return signalKey in SIGNAL_LABEL ? (signalKey as Signal) : null;
}

/**
 * The states describeSignalForMember will render as a direction rather than
 * as one of its three fixed phrases. Declared as data so the tier guard
 * below and its test read the same list.
 */
const DIRECTIONAL_STATES = new Set<SignalState>([
  'improving',
  'worsening',
  'stable',
  'established_pattern',
  'emerging_pattern',
  'repeated_signal',
  'one_time_observation',
  'resolved',
]);

/**
 * Builds the LongitudinalSignal shape the three-tier language module takes,
 * from the keys and numbers the plan stored.
 *
 * The two date fields are the only fields the module reads that the plan
 * does not carry, and it reads them ONLY in its coach-facing function,
 * never in describeSignalForMember. They are filled with the week start so
 * the object is well formed; nothing member-facing can reach them.
 */
function asSignal(observation: ReviewObservation, weekStart: string): LongitudinalSignal | null {
  if (!observation.state) return null;
  return {
    signalKey: observation.signalKey ?? observation.kind,
    signalKind: 'checkin_metric',
    signalLabel: observation.kind,
    state: observation.state as SignalState,
    tier: observation.tier,
    occurrenceCount: observation.metrics.occurrenceCount ?? 0,
    confidence: observation.metrics.confidence ?? 0,
    firstObservedAt: weekStart,
    lastObservedAt: weekStart,
    evidenceSummary: {},
  };
}

// ---------------------------------------------------------------------
// Observations — "What this week showed".
// ---------------------------------------------------------------------

/**
 * Daily Reset consistency, as two counts.
 *
 * This is the one observation that makes no pattern claim at all, which is
 * why it carries no tier gate: a count is a fact, and stating a fact
 * confidently is not the same as stating a pattern confidently.
 *
 * Every branch names what Root HAS. None of them names a missed day, and
 * the zero branch in particular is written so a member who was away reads
 * a statement about Root's records rather than about her.
 */
function renderResetConsistency(observation: ReviewObservation): string | null {
  const thisWeek = observation.metrics.thisWeekResets;
  const priorWeek = observation.metrics.priorWeekResets;
  if (thisWeek === undefined) return null;

  if (thisWeek === 0) {
    return 'Root has no Daily Resets from you for this week, so anything below is read from what came before it.';
  }

  const resetWord = plural(thisWeek, 'Daily Reset', 'Daily Resets');
  if (priorWeek === undefined) {
    return `Root has ${thisWeek} ${resetWord} from you this week.`;
  }
  if (priorWeek === 0) {
    return `Root has ${thisWeek} ${resetWord} from you this week, and nothing from the week before it to compare against.`;
  }
  if (thisWeek === priorWeek) {
    return `Root has ${thisWeek} ${resetWord} from you this week, the same as the week before.`;
  }
  return `Root has ${thisWeek} ${resetWord} from you this week, against ${priorWeek} the week before.`;
}

/**
 * A direction on one Daily Wellness Index metric, said at the tier the
 * pattern state itself earned.
 *
 * The tier gate is the `tier === null` refusal plus the fact that the
 * sentence comes from describeSignalForMember. Both matter: the first stops
 * a signal the module declined to tier being stated at all, the second
 * stops this file from choosing how confident to sound.
 */
function renderMetricDirection(
  observation: ReviewObservation,
  weekStart: string
): string | null {
  const metric = metricKeyFromSignalKey(observation.signalKey);
  if (!metric) return null;
  if (observation.tier === null) return null;
  if (!observation.state || !DIRECTIONAL_STATES.has(observation.state as SignalState)) return null;

  const signal = asSignal(observation, weekStart);
  if (!signal) return null;

  return `${WELLNESS_METRIC_LABEL[metric]}: ${describeSignalForMember(signal)}`;
}

/**
 * The three-tier language module's 'conflicting' state.
 *
 * Tier is null here by that module's own rule, and that is exactly why
 * this observation is allowed to render with a null tier while
 * renderMetricDirection is not: the module has a FIXED phrase for
 * conflicting, so nothing about how confident to sound is being decided.
 */
function renderConflicting(observation: ReviewObservation, weekStart: string): string | null {
  if (observation.state !== 'conflicting') return null;
  const signal = asSignal(observation, weekStart);
  if (!signal) return null;

  const metric = metricKeyFromSignalKey(observation.signalKey);
  const sentence = describeSignalForMember(signal);
  return metric ? `${WELLNESS_METRIC_LABEL[metric]}: ${sentence}` : sentence;
}

/** The Reset Plan's own weekly wording, called rather than rewritten. */
function renderPlanWeek(observation: ReviewObservation): string | null {
  const signal = signalFromKey(observation.signalKey);
  if (!signal || !observation.state) return null;
  return resetPlanWeekReflectionFor(observation.state as ResetPlanDay7Pattern, signal);
}

/**
 * The Priority Card's own friction wording, called rather than rewritten,
 * so the weekly review and the daily card cannot describe the same stuck
 * behavior differently.
 *
 * Those sentences deliberately carry no counts (see lib/priority/copy.ts's
 * own note on why a scoreboard stays off the screen), which is also the
 * right call here.
 */
const FRICTION_KINDS = new Set<string>([
  'daily_reset_incomplete',
  'food_logging_lapsed',
  'chronic_save_for_later',
]);

function renderFriction(observation: ReviewObservation): string | null {
  if (!observation.state || !FRICTION_KINDS.has(observation.state)) return null;
  const input: BehavioralFrictionInput = {
    kind: observation.state as BehavioralFrictionKind,
    signalType: observation.signalKey,
    starts: observation.metrics.starts ?? null,
    completions: observation.metrics.completions ?? null,
    completionRate: observation.metrics.completionRate ?? null,
    savedCount: null,
    windowDays: null,
    evidenceSufficiency: null,
  };
  return buildFrictionReason(input);
}

/**
 * What the Part 1 outcome ledger recorded about this week's actions.
 *
 * The zero branch is the sharpest copy decision in the file. "You ignored
 * everything" is both a scold and, per Part 1's own reasoning, the wrong
 * reading: a suggestion that does not land is a fact about the suggestion.
 * So the sentence puts it there and says nothing about her.
 */
function renderActionEngagement(observation: ReviewObservation): string | null {
  const delivered = observation.metrics.delivered;
  const acted = observation.metrics.acted;
  if (delivered === undefined || acted === undefined || delivered === 0) return null;

  if (acted === 0) {
    return "Root has no record of this week's suggestions landing yet. That is useful information about the suggestions.";
  }
  if (acted === delivered) {
    return `You picked up every one of the ${delivered} ${plural(delivered, 'thing', 'things')} Root offered this week.`;
  }
  return `Root offered ${delivered} small ${plural(delivered, 'thing', 'things')} this week, and you picked up ${acted}.`;
}

/** One observation, or null when the plan does not carry what its sentence needs. */
export function renderObservation(
  observation: ReviewObservation,
  weekStart: string
): string | null {
  switch (observation.kind) {
    case 'reset_consistency':
      return renderResetConsistency(observation);
    case 'metric_direction':
      return renderMetricDirection(observation, weekStart);
    case 'pattern_conflicting':
      return renderConflicting(observation, weekStart);
    case 'plan_week':
      return renderPlanWeek(observation);
    case 'friction':
      return renderFriction(observation);
    case 'action_engagement':
      return renderActionEngagement(observation);
  }
}

// ---------------------------------------------------------------------
// What worked.
// ---------------------------------------------------------------------

export function renderWorked(worked: ReviewWorked): string | null {
  switch (worked.kind) {
    case 'acted_on_actions': {
      const acted = worked.metrics.acted;
      if (acted === undefined || acted <= 0) return null;
      return `You took Root up on ${acted} ${plural(acted, 'suggestion', 'suggestions')} this week.`;
    }
    case 'plan_returns': {
      const normal = worked.metrics.normalCount ?? 0;
      const difficult = worked.metrics.difficultCount ?? 0;
      const total = normal + difficult;
      if (total <= 0) return null;
      if (difficult > 0 && normal > 0) {
        return `You came back to your Reset Plan action on ${total} ${plural(total, 'day', 'days')}, some of them on the difficult day version. That mix counts.`;
      }
      if (difficult > 0) {
        return `You came back to your Reset Plan action on ${total} ${plural(total, 'day', 'days')}, on the difficult day version. That still counts.`;
      }
      return `You came back to your Reset Plan action on ${total} ${plural(total, 'day', 'days')}.`;
    }
    case 'reset_days': {
      const resets = worked.metrics.thisWeekResets;
      if (resets === undefined || resets <= 0) return null;
      return `You logged ${resets} Daily ${plural(resets, 'Reset', 'Resets')}.`;
    }
  }
}

// ---------------------------------------------------------------------
// What Root is adjusting.
// ---------------------------------------------------------------------

/**
 * What the coming week is pointed at, by action type.
 *
 * Each of these is a statement of what ROOT will do, never an instruction
 * to her. No sentence ends in a period: ./buildAdjusting joins it to the
 * "because" clause below, so there is exactly one sentence and it always
 * carries its reason.
 */
export const FOCUS_STATEMENT: Record<CoachingActionType, string> = {
  reset: 'This coming week Root is going to keep pointing at the one small daily thing rather than adding anything new',
  nutrition: 'This coming week Root is going to keep pointing at food and water rather than adding anything new',
  reflection: 'This coming week Root is going to keep pointing at noticing rather than doing',
  reconnect: 'This coming week Root is going to keep things gentle and simply keep the door open',
  // In the schema, structurally unemittable by the engine. Present so this
  // map is exhaustive rather than partial, for the same reason
  // lib/coaching-direction/types.ts keeps the type itself.
  movement: 'This coming week Root is going to keep pointing at moving a little rather than adding anything new',
};

export const FOCUS_WHY: Record<string, string> = {
  friction_repeated:
    'because the thing that has been hardest to finish is the thing worth making smaller.',
  direction_worsening: 'because that is where your own week actually moved.',
  engagement_thin: 'because a smaller ask is more use to you right now than a better one.',
  engagement_strong: 'because what you did this week is worth continuing rather than replacing.',
  thin_history: 'because Root does not have enough from you yet to point anywhere more specific.',
};

export function buildAdjusting(plan: ReviewPlan): string {
  const actionType = plan.focus.actionType ?? 'reflection';
  const statement = FOCUS_STATEMENT[actionType];
  const why = FOCUS_WHY[plan.focus.reason] ?? FOCUS_WHY.thin_history!;
  return `${statement}, ${why}`;
}

// ---------------------------------------------------------------------
// The thin review.
// ---------------------------------------------------------------------

/**
 * The thin review's one observation, and the only place in this feature
 * where Root says out loud that it does not have enough yet.
 *
 * It deliberately reads as a statement of Root's records rather than of her
 * effort, and it never names a target number of check-ins she has failed to
 * reach.
 */
export function buildThinObservation(observation: ReviewObservation | undefined): string {
  const resets = observation?.metrics.thisWeekResets ?? 0;
  const spanDays = observation?.metrics.spanDays;

  if (resets <= 0) {
    return 'Root does not have a Daily Reset from you yet, so there is no week to read back. That is simply where things are.';
  }
  const resetWord = plural(resets, 'Daily Reset', 'Daily Resets');
  if (spanDays === undefined) {
    return `Root has ${resets} ${resetWord} from you so far. That is a real start and it is not yet enough to read a pattern from.`;
  }
  return `Root has ${resets} ${resetWord} from you across ${spanDays} ${plural(spanDays, 'day', 'days')} so far. That is a real start and it is not yet enough to read a pattern from.`;
}

/**
 * The single most useful thing she can do this week, for a thin member.
 * One thing, sized so that it is achievable on a bad day, and never framed
 * as catching up.
 */
export const THIN_ADJUSTING =
  'The single most useful thing this week is one Daily Reset, on whichever day suits you. Everything else Root can offer is built on those.';

// ---------------------------------------------------------------------
// The whole review.
// ---------------------------------------------------------------------

export function renderQuestions(
  plan: ReviewPlan,
  answers: Record<string, string>
): RenderedQuestion[] {
  return plan.questionKeys.filter(isQuestionKey).map((key) => ({
    key,
    prompt: QUESTIONS[key].prompt,
    options: QUESTIONS[key].options,
    answer: answers[key] ?? null,
  }));
}

/**
 * The review the member reads, built entirely from the stored plan.
 *
 * Deterministic and pure: the same plan always renders the same review, on
 * any day of the week, on any server. That is what lets the row store no
 * prose.
 */
export function renderReview(
  plan: ReviewPlan,
  weekStart: string,
  answers: Record<string, string>,
  acknowledged: boolean
): RenderedReview {
  const thin = plan.shape === 'thin';

  const showed = thin
    ? [buildThinObservation(plan.observations[0])]
    : plan.observations
        .map((observation) => renderObservation(observation, weekStart))
        .filter((sentence): sentence is string => sentence !== null);

  // A thin review never claims anything worked and never asks anything.
  const worked = thin
    ? []
    : plan.worked
        .map(renderWorked)
        .filter((sentence): sentence is string => sentence !== null);

  return {
    weekStart,
    shape: plan.shape,
    label: WEEKLY_REVIEW_LABEL,
    heading: thin ? WEEKLY_REVIEW_HEADING_THIN : WEEKLY_REVIEW_HEADING_FULL,
    showedTitle: SHOWED_TITLE,
    showed,
    workedTitle: WORKED_TITLE,
    worked,
    adjustingTitle: ADJUSTING_TITLE,
    adjusting: thin ? THIN_ADJUSTING : buildAdjusting(plan),
    questions: thin ? [] : renderQuestions(plan, answers),
    acknowledgeLabel: WEEKLY_REVIEW_ACKNOWLEDGE_LABEL,
    acknowledged,
  };
}
