/**
 * Part 1, "Your Week, According to Root".
 *
 * WHAT THIS MODULE IS ALLOWED TO DO. Count her Daily Resets in a seven day
 * window, and read back conclusions another system has already published
 * and already tiered. That is all. It classifies nothing, scores nothing
 * and qualifies nothing: every observation it can make is a READ of a
 * member_pattern_states row, whose state and language tier were decided by
 * lib/longitudinal-intelligence/signalState.ts over
 * lib/intelligence/trendEngine.ts's own output, and whose sentence is
 * rendered by lib/longitudinal-intelligence/copy.ts's three-tier language
 * module. Root never tells her something the engine has not qualified,
 * because there is no code path here that could invent one.
 *
 * THE THIN STATE IS THE FIRST STATE, NOT THE FALLBACK. A member with two
 * check-ins this week is the ordinary case in a real week, not an error,
 * and the recap is designed around her: the count is said warmly and in
 * full ("We only have 2 days of check-ins this week, so here is what we
 * saw"), and the observations are simply absent. They are absent rather
 * than hedged because two days is not enough for the trend engine to have
 * qualified anything worth reading back, and a hedged sentence over
 * nothing is how a product starts making things up.
 *
 * A COUNTED CLAIM NAMES ITS WINDOW. Every count in this file says which
 * seven days it counted, because the same number appears on the coach's
 * screen and the two must not be able to mean different things.
 *
 * WHAT IS STORED IS DESCRIPTORS, NEVER SENTENCES. buildReflectionRecap
 * produces the descriptors, renderReflectionRecap turns them into words at
 * read time, and only the descriptors reach the database. Same discipline
 * as lib/weekly-review/plan.ts, and the reason is the same: the member and
 * her coach then read one identical recap with nothing to keep in sync,
 * and a wording fix reaches every past week at once.
 */

import { describeSignalForMember, TIER_LABEL } from '../longitudinal-intelligence/copy';
import type { LongitudinalSignal, SignalState } from '../longitudinal-intelligence/types';
import { WELLNESS_METRIC_LABEL } from '../wellness/wellness-index';
import { metricKeyFromSignalKey } from '../longitudinal-intelligence/metricSignals';
import { recapRangeFor, withinRange } from './week';

/**
 * Below this many Daily Resets in the window, the recap says the count and
 * stops.
 *
 * Three, from the brief, and honest rather than arbitrary: the three-tier
 * language module's own tier 1 is "you mentioned this once", so two days
 * cannot have produced a repeated signal, and a single day cannot have
 * produced a direction at all.
 */
export const MIN_CHECKINS_FOR_OBSERVATIONS = 3;

/** At most three, from the brief. Root reads her week back, it does not file a report on it. */
export const MAX_RECAP_OBSERVATIONS = 3;

/** One already-classified signal, reduced to what the recap is allowed to store. Slugs and numbers, never a sentence. */
export type RecapSignal = {
  signalKey: string;
  /** The publishing system's own label. A metric slug like 'sleep', never prose. */
  signalLabel: string;
  state: SignalState;
  tier: 1 | 2 | 3 | null;
  occurrenceCount: number;
  confidence: number;
};

/** Part 1, as stored on the row and as recomputed live before she has finished. */
export type WeeklyReflectionRecap = {
  weekStart: string;
  from: string;
  to: string;
  checkinCount: number;
  /** Fewer than MIN_CHECKINS_FOR_OBSERVATIONS Daily Resets in the window. */
  thin: boolean;
  signals: RecapSignal[];
};

export type RecapObservation = {
  signalKey: string;
  /** 'Sleep', 'Energy'. Resolved at render time from the stored slug. */
  label: string;
  /** 'One-time observation' / 'Repeated signal' / 'Qualified pattern', or null for the three fixed-phrase states. */
  tierLabel: string | null;
  sentence: string;
};

export type RenderedRecap = {
  weekStart: string;
  from: string;
  to: string;
  checkinCount: number;
  thin: boolean;
  /** The warm opener that names the count and the window it counted. Always present, in every state. */
  intro: string;
  observations: RecapObservation[];
  /** Said only when there are no observations, so the section is never an empty box. */
  emptyNote: string | null;
};

// ---------------------------------------------------------------------
// Building the descriptors.
// ---------------------------------------------------------------------

/**
 * The metric a check-in signal is about, or null for a signal that is not
 * one.
 *
 * Moved to lib/longitudinal-intelligence/metricSignals.ts on 2026-09-05,
 * when the trial arc's day 6 recap needed the identical answer, and
 * re-exported here so every existing caller is untouched. One
 * implementation, so "a check-in metric signal" cannot come to mean two
 * different things on two screens.
 */
export { metricKeyFromSignalKey } from '../longitudinal-intelligence/metricSignals';

/**
 * Which signals may be read back, strongest first.
 *
 * Only check-in metric signals, because the recap's own opening sentence
 * is about her Daily Resets and a registry finding from a questionnaire
 * she filled in six weeks ago is not something "we saw this week".
 *
 * 'insufficient_data' is dropped outright rather than rendered through its
 * fixed phrase: it means the engine declined to say anything, and printing
 * "we do not have enough information yet to say much about this" under a
 * heading that has just said how many days she logged is saying the same
 * absence twice.
 *
 * 'conflicting' comes first when it is present, at most once. It is the
 * honest opening: Root could not read that part of the week cleanly, and
 * saying so before saying anything else is what keeps the rest credible.
 * Then directions, strongest tier first, then strongest confidence. Only
 * signals the language module already assigned a tier to are eligible, so
 * the tier limit is applied at selection as well as at render.
 */
export function selectRecapSignals(patternStates: readonly LongitudinalSignal[]): RecapSignal[] {
  const eligible = patternStates
    .filter((signal) => metricKeyFromSignalKey(signal.signalKey) !== null)
    .filter((signal) => signal.state !== 'insufficient_data');

  const conflicting = eligible.filter((signal) => signal.state === 'conflicting').slice(0, 1);

  const directions = eligible
    .filter((signal) => signal.state !== 'conflicting')
    .filter((signal) => signal.tier !== null)
    .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || b.confidence - a.confidence);

  return [...conflicting, ...directions].slice(0, MAX_RECAP_OBSERVATIONS).map((signal) => ({
    signalKey: signal.signalKey,
    signalLabel: signal.signalLabel,
    state: signal.state,
    tier: signal.tier,
    occurrenceCount: signal.occurrenceCount,
    confidence: signal.confidence,
  }));
}

export type RecapInputs = {
  /** Her own local Friday. */
  weekStart: string;
  /** Every Daily Reset local date she has, in any order. The window is applied here. */
  checkinLocalDates: readonly string[];
  /** member_pattern_states, already classified and already tiered. Never re-tiered here. */
  patternStates: readonly LongitudinalSignal[];
};

export function buildReflectionRecap(inputs: RecapInputs): WeeklyReflectionRecap {
  const range = recapRangeFor(inputs.weekStart);
  // Distinct days, not rows. `daily_checkins_current` already returns one
  // row per member per local_date, so the Set is belt and braces rather
  // than a second definition of the count; it is here so that a caller
  // handing this a list built some other way cannot make the number say
  // something `countLoggedDays` would not (lib/member-counts/checkinCounts.ts,
  // "one answer to how much has she logged").
  const checkinCount = new Set(
    inputs.checkinLocalDates.filter((date) => withinRange(date, range))
  ).size;
  const thin = checkinCount < MIN_CHECKINS_FOR_OBSERVATIONS;

  return {
    weekStart: inputs.weekStart,
    from: range.from,
    to: range.to,
    checkinCount,
    thin,
    // A thin week skips the observations entirely, rather than showing
    // fewer of them. See this file's header.
    signals: thin ? [] : selectRecapSignals(inputs.patternStates),
  };
}

// ---------------------------------------------------------------------
// Reading a stored recap back.
// ---------------------------------------------------------------------

const SIGNAL_STATES = new Set<string>([
  'one_time_observation',
  'repeated_signal',
  'emerging_pattern',
  'established_pattern',
  'improving',
  'worsening',
  'stable',
  'resolved',
  'stale',
  'conflicting',
  'insufficient_data',
]);

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The same allowlist applied on the way OUT as on the way in, so a row
 * written by any means renders only what the current vocabulary permits.
 *
 * Drops what it cannot read rather than throwing, exactly as
 * lib/weekly-review/plan.ts does: a member waiting on a page render is not
 * the person who should discover that one signal descriptor was malformed.
 * A recap it cannot make sense of at all comes back null, and the caller
 * treats that as "no recap", never as half a recap.
 */
export function sanitizeRecap(value: unknown): WeeklyReflectionRecap | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const weekStart = typeof raw.weekStart === 'string' ? raw.weekStart : null;
  const from = typeof raw.from === 'string' ? raw.from : null;
  const to = typeof raw.to === 'string' ? raw.to : null;
  if (!weekStart || !from || !to) return null;

  const checkinCount = Math.max(0, Math.round(finiteNumber(raw.checkinCount)));
  const signals = Array.isArray(raw.signals)
    ? raw.signals
        .map((entry): RecapSignal | null => {
          if (!entry || typeof entry !== 'object') return null;
          const row = entry as Record<string, unknown>;
          if (typeof row.signalKey !== 'string') return null;
          if (typeof row.state !== 'string' || !SIGNAL_STATES.has(row.state)) return null;
          const tier = row.tier === 1 || row.tier === 2 || row.tier === 3 ? row.tier : null;
          return {
            signalKey: row.signalKey,
            signalLabel: typeof row.signalLabel === 'string' ? row.signalLabel : '',
            state: row.state as SignalState,
            tier,
            occurrenceCount: Math.max(0, Math.round(finiteNumber(row.occurrenceCount))),
            confidence: finiteNumber(row.confidence),
          };
        })
        .filter((entry): entry is RecapSignal => entry !== null)
        .slice(0, MAX_RECAP_OBSERVATIONS)
    : [];

  return {
    weekStart,
    from,
    to,
    checkinCount,
    thin: checkinCount < MIN_CHECKINS_FOR_OBSERVATIONS,
    signals,
  };
}

// ---------------------------------------------------------------------
// The words.
// ---------------------------------------------------------------------

/**
 * The opener. Names the count and the window, in every state, warmly.
 *
 * Zero is a real week too, and it is said without a scolding word in it.
 * She is here, on a Friday, doing the reflection, and the number of days
 * she logged is a fact about the week rather than a verdict on her.
 */
export function recapIntro(checkinCount: number): string {
  if (checkinCount === 0) {
    return 'We do not have any check-ins from you in the last 7 days, so there is nothing for Root to read back this time. Your own words below are the whole picture.';
  }
  if (checkinCount === 1) {
    return 'We only have 1 day of check-ins in the last 7 days, so here is what we saw.';
  }
  if (checkinCount < MIN_CHECKINS_FOR_OBSERVATIONS) {
    return `We only have ${checkinCount} days of check-ins in the last 7 days, so here is what we saw.`;
  }
  return `You checked in on ${checkinCount} days in the last 7 days. Here is what Root noticed.`;
}

/**
 * What is said in place of the observations when there are none.
 *
 * Three genuinely different reasons, said as three different sentences,
 * because "not enough days yet" and "enough days, nothing steady enough to
 * name" are not the same message and a member can tell.
 */
function emptyNoteFor(checkinCount: number, thin: boolean): string | null {
  if (checkinCount === 0) return null;
  if (thin) {
    // Second person is avoided here, and only here. Every other sentence
    // in this recap is Root speaking to her, but this one also appears
    // verbatim on the coach's own panel (one recap, two readers), where
    // "back to you" would read as Root addressing the coach.
    return 'A few more days of check-ins and Root can start reading patterns back here.';
  }
  return 'Nothing steady enough to name yet this week. That is worth knowing too.';
}

function labelFor(signal: RecapSignal): string {
  const metric = metricKeyFromSignalKey(signal.signalKey);
  if (metric) return WELLNESS_METRIC_LABEL[metric];
  return signal.signalLabel || 'This signal';
}

/** The recap as words. Deterministic: the same descriptors always read the same way, for her and for her coach. */
export function renderReflectionRecap(recap: WeeklyReflectionRecap): RenderedRecap {
  const observations = recap.signals.map((signal) => ({
    signalKey: signal.signalKey,
    label: labelFor(signal),
    tierLabel: signal.tier === null ? null : TIER_LABEL[signal.tier],
    sentence: describeSignalForMember({
      signalKey: signal.signalKey,
      state: signal.state,
      tier: signal.tier,
    }),
  }));

  return {
    weekStart: recap.weekStart,
    from: recap.from,
    to: recap.to,
    checkinCount: recap.checkinCount,
    thin: recap.thin,
    intro: recapIntro(recap.checkinCount),
    observations,
    emptyNote: observations.length === 0 ? emptyNoteFor(recap.checkinCount, recap.thin) : null,
  };
}
