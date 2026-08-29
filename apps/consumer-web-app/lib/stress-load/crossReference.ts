/**
 * The one sentence, at most, where Root checks this sitting against her
 * daily check-ins.
 *
 * WHAT THIS MODULE IS ALLOWED TO DO. Read conclusions another system has
 * already published and already tiered (member_pattern_states, migrations
 * 93 and 105, classified by lib/longitudinal-intelligence/signalState.ts),
 * and say at most one of them out loud through the same three-tier language
 * module every other surface uses. It classifies nothing and qualifies
 * nothing. There is no code path here that could invent an observation.
 *
 * WITH THIN DATA IT SAYS NOTHING AT ALL. Below CROSS_REFERENCE_MIN_DAYS
 * logged days in the window, this returns null and the screen simply has no
 * such line on it. The observation is ABSENT rather than hedged, exactly as
 * the Weekly Reflection's recap treats a thin week, and for the same
 * reason: a hedged sentence over nothing is how a product starts making
 * things up.
 *
 * ONE SENTENCE, NEVER TWO. The brief allows Root to confirm or gently
 * contrast, once. So this picks a single signal and stops.
 *
 * WHAT IS STORED IS A DESCRIPTOR, NEVER A SENTENCE. The words are rendered
 * from the descriptor at read time, so she and her coach read one identical
 * line and a wording fix reaches every past sitting at once.
 */

import { describeSignalForMember } from '../longitudinal-intelligence/copy';
import type { LongitudinalSignal, SignalState } from '../longitudinal-intelligence/types';
import { WELLNESS_METRIC_LABEL, type WellnessMetricKey } from '../wellness/wellness-index';
import type { StressLoadAnswers } from './questions';
import { wellnessMetricsFor } from './signals';
import { isStressLoadPatternKey, sanitizeReading, type StressLoadReading } from './patterns';

/**
 * Below this many logged days in the evidence window, Root says nothing.
 *
 * Three, and honest rather than arbitrary: the three-tier language module's
 * own tier 1 is "you mentioned this once", so two days cannot have produced
 * a repeated signal, and one day cannot have produced a direction at all.
 * Same floor lib/weekly-reflection/recap.ts uses.
 */
export const CROSS_REFERENCE_MIN_DAYS = 3;

/** Whether her check-ins are pointing the same way as this sitting, or a little differently. */
export type CrossReferenceDirection = 'confirm' | 'contrast';

export type StressLoadCrossReference = {
  signalKey: string;
  metricKey: WellnessMetricKey;
  state: SignalState;
  tier: 1 | 2 | 3 | null;
  direction: CrossReferenceDirection;
  /** How many days were behind it, so the line can name the window it counted. */
  checkinDayCount: number;
  windowDays: number;
};

/** The whole stored interpretation: the reading from her answers, plus the one optional check-in line. */
export type StressLoadInterpretation = StressLoadReading & {
  crossReference: StressLoadCrossReference | null;
};

function metricKeyFromSignalKey(signalKey: string): WellnessMetricKey | null {
  if (!signalKey.startsWith('checkin_metric::')) return null;
  const metric = signalKey.slice('checkin_metric::'.length);
  return metric in WELLNESS_METRIC_LABEL ? (metric as WellnessMetricKey) : null;
}

/**
 * Which signals are eligible, strongest first.
 *
 * Only check-in metric signals, because this line's whole claim is about
 * her daily check-ins. Only signals the language module already gave a tier
 * to, so the tier limit is applied at selection as well as at render.
 * 'stale' is dropped outright: a signal the engine has already marked as
 * older information is not something to hold up beside answers she gave
 * ninety seconds ago.
 *
 * Stress comes first when it is present, because this is the Stress & Load
 * Deep-Dive and her stress metric is the most directly comparable thing the
 * check-in holds. After that, whichever of the metrics her own Q5 answers
 * named carries the strongest tier.
 */
export function selectCrossReferenceSignal(
  patternStates: readonly LongitudinalSignal[],
  answers: StressLoadAnswers
): LongitudinalSignal | null {
  const relevant = new Set<WellnessMetricKey>([
    'stress',
    ...wellnessMetricsFor(answers.body_signals.selected),
  ]);

  const eligible = patternStates.filter((signal) => {
    const metric = metricKeyFromSignalKey(signal.signalKey);
    if (!metric || !relevant.has(metric)) return false;
    if (signal.tier === null) return false;
    return signal.state !== 'insufficient_data' && signal.state !== 'stale';
  });

  if (eligible.length === 0) return null;

  const stress = eligible.filter(
    (signal) => metricKeyFromSignalKey(signal.signalKey) === 'stress'
  );
  const pool = stress.length > 0 ? stress : eligible;

  return (
    [...pool].sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || b.confidence - a.confidence)[0] ??
    null
  );
}

/**
 * Confirm or contrast.
 *
 * "Heavy" here means what this sitting itself found: either the load side
 * landed high, or her body is speaking loudly. A signal trending in a
 * tougher direction alongside that is agreement; one trending easier, or
 * holding steady, is the gentle contrast. When the sitting did NOT land
 * heavy, the directions simply swap, so a member whose load reads light
 * while her check-ins get harder is told so rather than congratulated.
 */
export function crossReferenceDirection(
  reading: StressLoadReading,
  state: SignalState
): CrossReferenceDirection {
  const heavy = reading.load.band === 'high' || reading.body.signalsLoud;
  const tougher = state === 'worsening';
  return heavy === tougher ? 'confirm' : 'contrast';
}

export function buildCrossReference(input: {
  reading: StressLoadReading;
  answers: StressLoadAnswers;
  patternStates: readonly LongitudinalSignal[];
  checkinDayCount: number;
  windowDays: number;
}): StressLoadCrossReference | null {
  if (input.checkinDayCount < CROSS_REFERENCE_MIN_DAYS) return null;

  const signal = selectCrossReferenceSignal(input.patternStates, input.answers);
  if (!signal) return null;

  const metricKey = metricKeyFromSignalKey(signal.signalKey);
  if (!metricKey) return null;

  return {
    signalKey: signal.signalKey,
    metricKey,
    state: signal.state,
    tier: signal.tier,
    direction: crossReferenceDirection(input.reading, signal.state),
    checkinDayCount: input.checkinDayCount,
    windowDays: input.windowDays,
  };
}

/**
 * The descriptor, as one sentence.
 *
 * The second half is rendered by the same three-tier language module the
 * Weekly Reflection, the coach's own panels and every longitudinal surface
 * already use, so this can never say something the engine has not
 * qualified. The first half is the frame, and it names the metric and the
 * window it counted, because a counted claim always says what it counted.
 */
export function renderCrossReference(reference: StressLoadCrossReference): string {
  const label = WELLNESS_METRIC_LABEL[reference.metricKey].toLowerCase();
  const described = describeSignalForMember({
    signalKey: reference.signalKey,
    state: reference.state,
    tier: reference.tier,
  });
  const lowered = described.charAt(0).toLowerCase() + described.slice(1);
  const window = `over the ${reference.checkinDayCount} days you checked in during the last ${reference.windowDays} days`;

  return reference.direction === 'confirm'
    ? `Your check-ins point the same way on ${label} ${window}: ${lowered}`
    : `Your check-ins read ${label} a little differently ${window}: ${lowered}`;
}

// ---------------------------------------------------------------------
// Reading a stored interpretation back.
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

function sanitizeCrossReference(value: unknown): StressLoadCrossReference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.signalKey !== 'string') return null;
  if (typeof raw.metricKey !== 'string' || !(raw.metricKey in WELLNESS_METRIC_LABEL)) return null;
  if (typeof raw.state !== 'string' || !SIGNAL_STATES.has(raw.state)) return null;
  if (raw.direction !== 'confirm' && raw.direction !== 'contrast') return null;

  const tier = raw.tier === 1 || raw.tier === 2 || raw.tier === 3 ? raw.tier : null;
  const count = typeof raw.checkinDayCount === 'number' ? Math.max(0, Math.round(raw.checkinDayCount)) : 0;
  const windowDays = typeof raw.windowDays === 'number' ? Math.max(1, Math.round(raw.windowDays)) : 1;

  return {
    signalKey: raw.signalKey,
    metricKey: raw.metricKey as WellnessMetricKey,
    state: raw.state as SignalState,
    tier,
    direction: raw.direction,
    checkinDayCount: count,
    windowDays,
  };
}

/**
 * The stored `pattern` column, read back.
 *
 * Drops what it cannot read rather than throwing. A reading it cannot make
 * sense of at all comes back null and the caller treats that as "no stored
 * reading", never as half a reading. A cross reference it cannot read is
 * simply absent, which is the same state as the sitting never having had
 * one.
 */
export function sanitizeInterpretation(value: unknown): StressLoadInterpretation | null {
  const reading = sanitizeReading(value);
  if (!reading) return null;
  const raw = value as Record<string, unknown>;
  if (!isStressLoadPatternKey(reading.patternKey)) return null;
  return { ...reading, crossReference: sanitizeCrossReference(raw.crossReference) };
}
