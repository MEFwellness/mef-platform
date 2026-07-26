/**
 * Correlation Engine — the evidence gates (requirements 4-5). Every
 * threshold used anywhere in this module is a named constant declared
 * here, in one place, per the request. Pure, no I/O.
 */

import { pairNextDay, pairSameDay, spanDays, splitInHalf } from './pairing';
import { hasSufficientVariation, spearmanRho } from './stats';
import type { CorrelationEvidence, CorrelationLag, DailySeries } from './types';

/** Fewer than this many genuinely-paired days (both values real, same lag) and a correlation isn't tested at all, however strong it looks. */
export const MIN_PAIRED_OBSERVATIONS = 21;

/** The paired observations must also span at least this many elapsed calendar days — 21 same-week data points from a single dense burst is not "over time." */
export const MIN_SPAN_DAYS = 21;

/** Cohen's conventional "medium" effect size for a correlation coefficient — the floor requirement 4 asks for ("an effect size above a meaningful floor rather than significance alone"), independent of sample-size-derived statistical significance. */
export const EFFECT_SIZE_FLOOR = 0.3;

/**
 * Each split-window half needs at least this many paired observations
 * before its own rho is trusted at all — roughly a third of the full
 * gate, since requiring the full MIN_PAIRED_OBSERVATIONS in *each* half
 * would need ~42 total paired days just to ever test stability. A half
 * with fewer than this is treated as "not yet provable," not as passing.
 */
export const MIN_SPLIT_WINDOW_OBSERVATIONS = 8;

function directionOf(rho: number): 'positive' | 'negative' {
  return rho >= 0 ? 'positive' : 'negative';
}

/** True if this lag's full-history pairing clears every base gate on its own. */
function passesBaseGate(paired: { outcome: number[]; driver: number[]; dates: string[] }): boolean {
  if (paired.dates.length < MIN_PAIRED_OBSERVATIONS) return false;
  if (spanDays(paired.dates) < MIN_SPAN_DAYS) return false;
  if (!hasSufficientVariation(paired.outcome) || !hasSufficientVariation(paired.driver)) return false;
  const rho = spearmanRho(paired.outcome, paired.driver);
  return Math.abs(rho) >= EFFECT_SIZE_FLOOR;
}

/**
 * Does the SAME relationship (matching direction, still above the effect
 * floor) independently show up in both halves of the member's history? A
 * half with too little data to test at all does not count as agreement —
 * "a relationship present in one stretch and absent in the other is not a
 * pattern," and neither is one that was simply never checked.
 */
function checkSplitWindowAgreement(
  paired: { outcome: number[]; driver: number[]; dates: string[] },
  fullDirection: 'positive' | 'negative'
): boolean {
  const [first, second] = splitInHalf(paired);
  for (const half of [first, second]) {
    if (half.dates.length < MIN_SPLIT_WINDOW_OBSERVATIONS) return false;
    if (!hasSufficientVariation(half.outcome) || !hasSufficientVariation(half.driver)) return false;
    const halfRho = spearmanRho(half.outcome, half.driver);
    if (Math.abs(halfRho) < EFFECT_SIZE_FLOOR) return false;
    if (directionOf(halfRho) !== fullDirection) return false;
  }
  return true;
}

/**
 * Tests both lags (same-day, next-day — never more, per requirement 3),
 * keeps whichever passes the base gate with the larger effect size, and
 * runs the split-window stability check against it. Returns null when
 * neither lag ever clears the base gate — the caller records
 * 'insufficient_data' rather than a measurement in that case.
 */
export function evaluatePair(outcomeSeries: DailySeries, driverSeries: DailySeries): CorrelationEvidence | null {
  const candidates: { lag: CorrelationLag; paired: ReturnType<typeof pairSameDay> }[] = [
    { lag: 'same_day', paired: pairSameDay(outcomeSeries, driverSeries) },
    { lag: 'next_day', paired: pairNextDay(outcomeSeries, driverSeries) },
  ];

  let best: { lag: CorrelationLag; paired: ReturnType<typeof pairSameDay>; rho: number } | null = null;
  for (const candidate of candidates) {
    if (!passesBaseGate(candidate.paired)) continue;
    const rho = spearmanRho(candidate.paired.outcome, candidate.paired.driver);
    if (!best || Math.abs(rho) > Math.abs(best.rho)) {
      best = { lag: candidate.lag, paired: candidate.paired, rho };
    }
  }

  if (!best) return null;

  const direction = directionOf(best.rho);
  return {
    lag: best.lag,
    direction,
    rho: best.rho,
    observationCount: best.paired.dates.length,
    spanDays: spanDays(best.paired.dates),
    splitWindowAgreement: checkSplitWindowAgreement(best.paired, direction),
  };
}
