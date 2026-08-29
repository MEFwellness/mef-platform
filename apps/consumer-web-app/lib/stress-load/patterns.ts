/**
 * The interpretation. Two sides, held apart, and one pattern name.
 *
 * THE TWO SIDES ARE NEVER COLLAPSED. There is a load side and a recovery
 * side, they are computed separately, stored separately, rendered
 * separately and written to two separate Root Map dimensions. There is no
 * combined number anywhere in this file and no function here returns one.
 * A member can be under a heavy load with strong recovery, or under a
 * moderate load with almost nothing restoring her, and those are opposite
 * coaching situations that a single score would print as the same middle
 * number.
 *
 * PURE. No I/O, no clock, no randomness: the same eleven answers always
 * produce the same reading, for her and for her coach, today and in six
 * months.
 *
 * WHAT IS STORED IS DESCRIPTORS, NEVER SENTENCES, the same discipline
 * lib/weekly-reflection/recap.ts and lib/weekly-review/plan.ts hold. This
 * file produces slugs and numbers; lib/stress-load/copy.ts turns them into
 * words at read time.
 *
 * THE THRESHOLDS, WRITTEN DOWN
 *
 *   Load side
 *     weight        Q1, 1 (Light) to 5 (Crushing), as she answered it.
 *     breadth       how many sources she named in Q2, 1 to 8.
 *     breadthPoints 0 for one source, 1 for two or three, 2 for four or more.
 *     loadPoints    weight + breadthPoints, so 1 to 7.
 *     band          light at 2 or below, moderate at 3 to 4, high at 5 or above.
 *
 *   Recovery side
 *     amountPoints  Q10: None 0, A taste 1, Some but not enough 2,
 *                   A fair amount 3, Plenty 4.
 *     namesSupport  Q11 names at least one person or thing that is not
 *                   "No one right now".
 *     recoveryPoints amountPoints + (namesSupport ? 1 : 0), so 0 to 5.
 *     band          thin at 1 or below, partial at 2 to 3, solid at 4 or above.
 *
 *   The body
 *     signalCount   how many ways she said her body tells her, Q5, 0 to 8.
 *     signalsLoud   4 or more of the 8.
 *
 * Each threshold is chosen against the answer scale it reads rather than
 * picked out of the air. Breadth earns its first point at two sources
 * because one source of pressure is a situation and two is a pile-up.
 * Recovery's support point is worth exactly one step of the amount scale,
 * because "a fair amount, alone" and "some, but not enough, with people"
 * are genuinely close, and neither of them is thin.
 */

import {
  BODY_SIGNAL_OPTIONS,
  NO_ONE_VALUE,
  RECOVERY_AMOUNT_OPTIONS,
  type StressLoadAnswers,
} from './questions';

export type LoadBand = 'light' | 'moderate' | 'high';
export type RecoveryBand = 'thin' | 'partial' | 'solid';

export const STRESS_LOAD_PATTERN_KEYS = [
  'carrying_it_alone',
  'body_speaking_first',
  'heavy_load_thin_recovery',
  'recovery_running_behind',
  'loaded_but_buffered',
  'balance_as_it_is',
] as const;

export type StressLoadPatternKey = (typeof STRESS_LOAD_PATTERN_KEYS)[number];

export function isStressLoadPatternKey(value: unknown): value is StressLoadPatternKey {
  return (
    typeof value === 'string' &&
    (STRESS_LOAD_PATTERN_KEYS as readonly string[]).includes(value)
  );
}

/** The load side on its own. Nothing about recovery reaches this type. */
export type LoadSide = {
  /** Q1, as she answered it. */
  weight: number;
  /** How many sources she named in Q2. */
  breadth: number;
  breadthPoints: number;
  loadPoints: number;
  band: LoadBand;
};

/** The recovery side on its own. Nothing about load reaches this type. */
export type RecoverySide = {
  amountPoints: number;
  namesSupport: boolean;
  recoveryPoints: number;
  band: RecoveryBand;
};

export type BodySide = {
  signalCount: number;
  signalsLoud: boolean;
};

/** The whole reading, as descriptors. Two sides, never one. */
export type StressLoadReading = {
  patternKey: StressLoadPatternKey;
  load: LoadSide;
  recovery: RecoverySide;
  body: BodySide;
};

// ---------------------------------------------------------------------
// The thresholds, as named constants so a test can assert them.
// ---------------------------------------------------------------------

export const BREADTH_FOR_ONE_POINT = 2;
export const BREADTH_FOR_TWO_POINTS = 4;
export const LOAD_POINTS_FOR_MODERATE = 3;
export const LOAD_POINTS_FOR_HIGH = 5;
export const RECOVERY_POINTS_FOR_PARTIAL = 2;
export const RECOVERY_POINTS_FOR_SOLID = 4;
export const BODY_SIGNALS_FOR_LOUD = 4;
/** "Full or below" on Q1, which is where the brief draws the line for Body Speaking First. */
export const REPORTED_LOAD_AT_OR_BELOW_FULL = 3;

/** Q10's five options, in the order they are offered, scored 0 to 4. Derived from the option list itself so a reordered question cannot silently re-score. */
const AMOUNT_POINTS: Record<string, number> = Object.fromEntries(
  RECOVERY_AMOUNT_OPTIONS.map((option, index) => [option.value, index])
);

export function breadthPointsFor(breadth: number): number {
  if (breadth >= BREADTH_FOR_TWO_POINTS) return 2;
  if (breadth >= BREADTH_FOR_ONE_POINT) return 1;
  return 0;
}

export function loadBandFor(loadPoints: number): LoadBand {
  if (loadPoints >= LOAD_POINTS_FOR_HIGH) return 'high';
  if (loadPoints >= LOAD_POINTS_FOR_MODERATE) return 'moderate';
  return 'light';
}

export function recoveryBandFor(recoveryPoints: number): RecoveryBand {
  if (recoveryPoints >= RECOVERY_POINTS_FOR_SOLID) return 'solid';
  if (recoveryPoints >= RECOVERY_POINTS_FOR_PARTIAL) return 'partial';
  return 'thin';
}

export function computeLoadSide(answers: StressLoadAnswers): LoadSide {
  const weight = answers.load_weight;
  const breadth = answers.load_sources.selected.length;
  const breadthPoints = breadthPointsFor(breadth);
  const loadPoints = weight + breadthPoints;
  return { weight, breadth, breadthPoints, loadPoints, band: loadBandFor(loadPoints) };
}

/**
 * Whether she named anyone or anything at all.
 *
 * "No one right now" is the one option that is not a source of support, so
 * naming it and nothing else is naming nobody. A member who ticks it
 * alongside a real answer has named somebody, and the real answer wins.
 */
export function namesSupport(answers: StressLoadAnswers): boolean {
  return answers.lean_on.selected.some((value) => value !== NO_ONE_VALUE);
}

export function computeRecoverySide(answers: StressLoadAnswers): RecoverySide {
  const amountPoints = AMOUNT_POINTS[answers.recovery_amount] ?? 0;
  const support = namesSupport(answers);
  const recoveryPoints = amountPoints + (support ? 1 : 0);
  return {
    amountPoints,
    namesSupport: support,
    recoveryPoints,
    band: recoveryBandFor(recoveryPoints),
  };
}

export function computeBodySide(answers: StressLoadAnswers): BodySide {
  const signalCount = answers.body_signals.selected.filter((value) =>
    BODY_SIGNAL_OPTIONS.some((option) => option.value === value)
  ).length;
  return { signalCount, signalsLoud: signalCount >= BODY_SIGNALS_FOR_LOUD };
}

/**
 * Which pattern this is, in the brief's precedence order.
 *
 * The order is the interpretation, not a tie-break convenience:
 *
 *   1. Carrying It Alone outranks everything, because a heavy load with
 *      nobody named is the one state where the answer is not a protocol.
 *   2. Body Speaking First is checked before either recovery comparison,
 *      because it is the case where her body is louder than her own account
 *      of the load, and a rule that read the load first would file her
 *      under a lighter story than her body is telling.
 *   3. Heavy Load, Thin Recovery.
 *   4. Recovery Running Behind. A high load, a recovery side that is
 *      genuinely working but only partial, a body that is not loud, and
 *      somebody named. It sits BELOW Heavy Load, Thin Recovery on purpose:
 *      a thin recovery side is the more serious of the two and must keep
 *      its own name, so this branch only ever picks up the partial case
 *      that used to fall through to the plain state.
 *   5. Loaded but Buffered.
 *   6. Everything else is the honest plain state. It has no dramatic name
 *      because there is nothing dramatic to name, and the two sides are
 *      still reported separately and in full. Moderate and light loads all
 *      land here, unchanged.
 */
export function selectPattern(
  load: LoadSide,
  recovery: RecoverySide,
  body: BodySide
): StressLoadPatternKey {
  if (load.band === 'high' && !recovery.namesSupport) return 'carrying_it_alone';
  if (body.signalsLoud && load.weight <= REPORTED_LOAD_AT_OR_BELOW_FULL) {
    return 'body_speaking_first';
  }
  if (load.band === 'high' && recovery.band === 'thin') return 'heavy_load_thin_recovery';
  if (
    load.band === 'high' &&
    recovery.band === 'partial' &&
    !body.signalsLoud &&
    recovery.namesSupport
  ) {
    return 'recovery_running_behind';
  }
  if (load.band === 'high' && recovery.band === 'solid') return 'loaded_but_buffered';
  return 'balance_as_it_is';
}

export function buildStressLoadReading(answers: StressLoadAnswers): StressLoadReading {
  const load = computeLoadSide(answers);
  const recovery = computeRecoverySide(answers);
  const body = computeBodySide(answers);
  return { patternKey: selectPattern(load, recovery, body), load, recovery, body };
}

// ---------------------------------------------------------------------
// Reading a stored reading back.
// ---------------------------------------------------------------------

const LOAD_BANDS = new Set<string>(['light', 'moderate', 'high']);
const RECOVERY_BANDS = new Set<string>(['thin', 'partial', 'solid']);

function finiteInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

/**
 * The same allowlist applied on the way OUT as on the way in, so a row
 * written by any means renders only what the current vocabulary permits.
 *
 * Returns null rather than half a reading, exactly as
 * lib/weekly-reflection/recap.ts's sanitizer does, and the caller treats
 * null as "no stored reading" rather than as an error a member has to see.
 */
export function sanitizeReading(value: unknown): StressLoadReading | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!isStressLoadPatternKey(raw.patternKey)) return null;

  const load = raw.load as Record<string, unknown> | undefined;
  const recovery = raw.recovery as Record<string, unknown> | undefined;
  const body = raw.body as Record<string, unknown> | undefined;
  if (!load || !recovery || !body) return null;
  if (typeof load.band !== 'string' || !LOAD_BANDS.has(load.band)) return null;
  if (typeof recovery.band !== 'string' || !RECOVERY_BANDS.has(recovery.band)) return null;

  return {
    patternKey: raw.patternKey,
    load: {
      weight: finiteInt(load.weight),
      breadth: finiteInt(load.breadth),
      breadthPoints: finiteInt(load.breadthPoints),
      loadPoints: finiteInt(load.loadPoints),
      band: load.band as LoadBand,
    },
    recovery: {
      amountPoints: finiteInt(recovery.amountPoints),
      namesSupport: recovery.namesSupport === true,
      recoveryPoints: finiteInt(recovery.recoveryPoints),
      band: recovery.band as RecoveryBand,
    },
    body: {
      signalCount: finiteInt(body.signalCount),
      signalsLoud: body.signalsLoud === true,
    },
  };
}
