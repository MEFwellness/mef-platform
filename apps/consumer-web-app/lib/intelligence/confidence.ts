/**
 * Shared confidence/strength/evidence math — every detector in
 * lib/intelligence/{trend,pattern,strength}Engine.ts calls into this
 * instead of inventing its own thresholds, so "is this real" means the
 * same thing everywhere in the engine (same discipline as
 * lib/wellness/wellness-index.ts being the one place "sleep's score
 * today" is defined).
 */

import type {
  WellnessTrendStrength,
  WellnessIntelligenceTimeWindow,
} from '@mef/shared-types-contracts';

/** Minimum real check-ins required in a window before ANY conclusion is drawn from it — "do not treat one or two records as a strong trend." */
export const MIN_SAMPLE_FOR_WINDOW: Record<WellnessIntelligenceTimeWindow, number> = {
  last_7_days: 4,
  previous_7_days: 4,
  last_14_days: 6,
  last_30_days: 10,
  previous_30_days: 10,
  last_90_days: 20,
  since_baseline: 1, // gated instead by "does a baseline submission exist"
  since_reassessment: 1, // gated instead by "does a reassessment submission exist"
};

/** A day-of-week pattern needs at least this many occurrences of that weekday in the window, or one unusual Saturday would "prove" a weekend pattern. */
export const MIN_WEEKDAY_OCCURRENCES = 3;

/** Below this, an insight is too weak to be worth persisting at all — "prefer showing no insight over showing an unreliable insight." */
export const MIN_CONFIDENCE_TO_PERSIST = 0.55;

/** Same shape as lib/narrative/generator.ts's inline formula, centralized here for reuse across every detector — grows with real sample size, capped so confidence is never asserted as certainty. */
export function confidenceFromSample(
  sampleSize: number,
  base = 0.5,
  scaleDivisor = 30,
  cap = 0.9
): number {
  return Math.min(base + sampleSize / scaleDivisor, cap);
}

/** Magnitude bands on the 0-100 normalized metric scale (lib/wellness/wellness-index.ts's own scale) — independent of lib/wellness/insights.ts's shorter-window SIGNIFICANT_CHANGE=12 threshold, since this engine compares longer windows and needs its own bands. */
export function strengthFromDelta(absDelta: number): WellnessTrendStrength {
  if (absDelta >= 20) return 'strong';
  if (absDelta >= 10) return 'moderate';
  return 'mild';
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
