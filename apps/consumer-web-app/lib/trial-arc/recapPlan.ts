/**
 * DAY 6, the privacy and honesty boundary, in code.
 *
 * The same discipline as lib/weekly-review/plan.ts and
 * lib/weekly-reflection/recap.ts's own sanitizeRecap, and it runs in BOTH
 * directions: a plan is sanitized on the way into the database and again on
 * the way out, so a row written by an older build, by a script, or by hand
 * can never render something the current vocabulary would refuse to store.
 *
 * WHAT MAY BE STORED. A tier. A card kind. A slug from a closed set
 * declared in this codebase (a value area, a signal, a readiness pattern, a
 * public entry pattern key, a welcome goal key, a member_pattern_states
 * state). Finite numbers under allowlisted keys.
 *
 * WHAT MAY NEVER BE STORED, under any key. A check-in answer. A pain
 * location. A free text goal ("something else" carries a `goals_other`
 * column, and this build never reads it). An assessment answer. A
 * questionnaire response. Any composed member-facing sentence, including
 * one this feature itself wrote.
 *
 * THE TIER CAP IS ENFORCED HERE TOO, not only at selection: an observation
 * whose tier is not 1 or 2 is REFUSED rather than accepted and hidden. Day
 * 6 is six days into an account's life and the three-tier module's tier 3
 * openers contain the word pattern, so there is no plan a tier 3 signal
 * could sit on waiting for a renderer to remember to drop it.
 *
 * DROPS RATHER THAN THROWS. A member waiting on a screen is not the person
 * who should discover that one card descriptor was malformed. A plan that
 * cannot be made sense of at all comes back null, and the caller treats
 * that as "no recap", never as half a recap.
 */

import type { PublicEntryPatternKey } from '@mef/shared-types-contracts';
import type { Signal } from '../life-signal-check/constants';
import { SIGNALS } from '../life-signal-check/constants';
import type { ReadinessPattern } from '../readiness-pulse/constants';
import type { SignalState } from '../longitudinal-intelligence/types';
import {
  WELCOME_GOAL_KEY_SET,
  isPublicEntryPatternKey,
  isSignal,
  isTrialArcExperimentState,
  isTrialArcOneThingSource,
  isTrialArcRecapCardKind,
  isTrialArcRecapNextStep,
  isTrialArcRecapTier,
  isValueArea,
  type TrialArcRecapCard,
  type TrialArcRecapCounts,
  type TrialArcRecapPlan,
} from './recapTypes';

/**
 * Every metric key that may appear on a card or on the counts.
 *
 * Note what is NOT here, and could not be added without a deliberate
 * decision: no key describing a health VALUE. A count of days she logged is
 * behaviour. A sleep score is not, and there is no key it could travel
 * under. The loudness scores are the one apparent exception and they are
 * not stored as metrics at all: they are a fixed record keyed by the six
 * signals, validated below, because they are the bars her own Life Signal
 * Check results screen already showed her.
 */
export const ALLOWED_RECAP_METRIC_KEYS = [
  // The one thing card, when it came from her check-ins.
  'checkinDays',
  // The experiment card.
  'daysLogged',
  'durationDays',
] as const;

const ALLOWED_METRICS = new Set<string>(ALLOWED_RECAP_METRIC_KEYS);

/** The readiness patterns, as a set. Declared here rather than imported as an array because ./constants.ts exports the type and the label map, not a list. */
const READINESS_PATTERNS = new Set<string>([
  'ready_now',
  'ready_if_small',
  'still_deciding',
  'not_yet',
]);

/**
 * The member_pattern_states states an observation card may carry.
 *
 * Deliberately short. The three fixed-phrase states are excluded because
 * each of them says the same thing the recap is already saying: 'stale' and
 * 'insufficient_data' announce an absence under a heading that has just
 * counted her days, and 'conflicting' is an honest opening for a whole
 * weekly recap and a strange single observation on day 6. 'resolved' claims
 * something settled down, which needs a before and an after that six days
 * cannot hold. What is left is the four readings that are genuinely about
 * something she logged.
 */
const ALLOWED_OBSERVATION_STATES = new Set<string>([
  'one_time_observation',
  'repeated_signal',
  'improving',
  'worsening',
  'stable',
]);

/** Numbers only, finite only, allowlisted keys only. Drops rather than throws. */
export function sanitizeRecapMetrics(metrics: Record<string, unknown>): Record<string, number> {
  const clean: Record<string, number> = {};
  for (const [key, value] of Object.entries(metrics)) {
    if (!ALLOWED_METRICS.has(key)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    clean[key] = value;
  }
  return clean;
}

/**
 * The six loudness scores, as Life Signal Check itself scores them.
 *
 * All six keys must be present and every value must be a whole number from
 * 0 to 3, because that is what the bar visual reads and a partial record
 * would draw a chart with a missing row. Anything else returns null and the
 * card is dropped, rather than drawing bars over a guess.
 */
export function sanitizeSignalScores(input: unknown): Record<Signal, number> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const clean = {} as Record<Signal, number>;
  for (const signal of SIGNALS) {
    const value = raw[signal];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 3) return null;
    clean[signal] = value;
  }
  return clean;
}

/** One card, or null. Every variant validates its own slugs; there is no default that lets an unknown shape through. */
export function sanitizeRecapCard(input: unknown): TrialArcRecapCard | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (!isTrialArcRecapCardKind(raw.kind)) return null;

  switch (raw.kind) {
    case 'fatigue_callback': {
      if (!isPublicEntryPatternKey(raw.patternKey)) return null;
      return { kind: 'fatigue_callback', patternKey: raw.patternKey as PublicEntryPatternKey };
    }

    case 'one_thing': {
      if (!isTrialArcOneThingSource(raw.source)) return null;
      const patternKey = isPublicEntryPatternKey(raw.patternKey)
        ? (raw.patternKey as PublicEntryPatternKey)
        : null;
      const goalKey =
        typeof raw.goalKey === 'string' && WELCOME_GOAL_KEY_SET.has(raw.goalKey)
          ? raw.goalKey
          : null;
      const metrics = sanitizeRecapMetrics((raw.metrics as Record<string, unknown>) ?? {});
      // The source has to be backed by the thing it names, or the card is
      // an assertion with nothing behind it.
      if (raw.source === 'arrival' && !patternKey) return null;
      if (raw.source === 'goal' && !goalKey) return null;
      if (raw.source === 'checkin' && !(metrics.checkinDays && metrics.checkinDays > 0)) return null;
      return { kind: 'one_thing', source: raw.source, patternKey, goalKey, metrics };
    }

    case 'top_value': {
      if (!isValueArea(raw.valueArea)) return null;
      return { kind: 'top_value', valueArea: raw.valueArea };
    }

    case 'loudest_signal': {
      if (!isSignal(raw.signal)) return null;
      const signalScores = sanitizeSignalScores(raw.signalScores);
      if (!signalScores) return null;
      return { kind: 'loudest_signal', signal: raw.signal, signalScores };
    }

    case 'experiment': {
      if (!isTrialArcExperimentState(raw.state)) return null;
      return {
        kind: 'experiment',
        state: raw.state,
        metrics: sanitizeRecapMetrics((raw.metrics as Record<string, unknown>) ?? {}),
      };
    }

    case 'readiness': {
      if (typeof raw.readinessPattern !== 'string' || !READINESS_PATTERNS.has(raw.readinessPattern)) {
        return null;
      }
      return { kind: 'readiness', readinessPattern: raw.readinessPattern as ReadinessPattern };
    }

    case 'checkin_observation': {
      // A signal key is an identifier. An identifier never contains
      // whitespace; a sentence fragment always will. Same 64 character
      // ceiling reasoning as lib/weekly-review/plan.ts's own slug rule,
      // widened only because a pattern state key carries two namespaced
      // segments.
      if (typeof raw.signalKey !== 'string') return null;
      if (raw.signalKey.length === 0 || raw.signalKey.length > 64) return null;
      if (/\s/.test(raw.signalKey)) return null;
      if (typeof raw.state !== 'string' || !ALLOWED_OBSERVATION_STATES.has(raw.state)) return null;
      if (raw.tier !== 1 && raw.tier !== 2) return null;
      return {
        kind: 'checkin_observation',
        signalKey: raw.signalKey,
        state: raw.state as SignalState,
        tier: raw.tier,
      };
    }
  }
}

/** At most this many cards on one recap. Root reads her week back, it does not file a report on it. */
export const MAX_RECAP_CARDS = 6;

function wholeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function sanitizeRecapCounts(input: unknown): TrialArcRecapCounts {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    trialDays: wholeCount(raw.trialDays),
    checkinDays: wholeCount(raw.checkinDays),
    // Three free conversations, and no arithmetic anywhere can make it four.
    conversations: Math.min(3, wholeCount(raw.conversations)),
  };
}

/**
 * The one function that builds a storable plan and the one that reads one
 * back.
 *
 * The fatigue callback flag is DERIVED from the cards here rather than
 * trusted from the input, so the stored flag and the stored cards cannot
 * disagree about whether the callback is present. One source of truth per
 * number, applied to a boolean.
 *
 * The callback card is also moved to the front here rather than being
 * assumed to have been put there, because "first in the reveal order" is a
 * rule of this build and a rule enforced in one place is a rule.
 */
export function sanitizeRecapPlan(input: unknown): TrialArcRecapPlan | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (!isTrialArcRecapTier(raw.tier)) return null;

  const cards = (Array.isArray(raw.cards) ? raw.cards : [])
    .map(sanitizeRecapCard)
    .filter((card): card is TrialArcRecapCard => card !== null)
    .slice(0, MAX_RECAP_CARDS);

  const callback = cards.filter((card) => card.kind === 'fatigue_callback');
  const rest = cards.filter((card) => card.kind !== 'fatigue_callback');
  // At most one callback, whatever arrived.
  const ordered = [...callback.slice(0, 1), ...rest];

  return {
    tier: raw.tier,
    fatigueCallback: callback.length > 0,
    cards: ordered,
    counts: sanitizeRecapCounts(raw.counts),
    nextStep: isTrialArcRecapNextStep(raw.nextStep) ? raw.nextStep : null,
  };
}

/**
 * Exported for the guard test, which asserts these closed sets never grow a
 * free-text field, rather than only asserting that today's sanitizer
 * happens to drop one.
 */
export const RECAP_VOCABULARY = {
  metricKeys: ALLOWED_RECAP_METRIC_KEYS,
  observationStates: [...ALLOWED_OBSERVATION_STATES],
  readinessPatterns: [...READINESS_PATTERNS],
} as const;
