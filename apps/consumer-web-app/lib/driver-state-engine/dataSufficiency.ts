/**
 * Driver State Engine — "enough paired data" check, independent of
 * effect size. The correlation engine's own evaluatePair() (evidence.ts)
 * returns null both when there isn't enough data AND when there's plenty
 * of data but the relationship is simply weak — member_correlation_findings
 * persists both cases identically as 'insufficient_data' with no
 * observation count. Ruling a driver out requires telling those two
 * apart ("enough paired data on it and found no relationship clearing
 * the floor" — a driver that was never really tested must stay
 * 'unknown', not 'ruled_out').
 *
 * This file computes nothing the correlation engine doesn't already
 * compute internally — it reuses that engine's own exported, pure
 * building blocks (pairing, variation-check, and its named thresholds)
 * rather than re-deriving them, per the standing instruction not to
 * change lib/correlation-engine/ itself. It never calls evaluatePair's
 * effect-size gate — only the data-volume half of what passesBaseGate
 * (evidence.ts, private) checks.
 */

import { pairNextDay, pairSameDay, spanDays } from '../correlation-engine/pairing';
import { hasSufficientVariation } from '../correlation-engine/stats';
import { MIN_PAIRED_OBSERVATIONS, MIN_SPAN_DAYS } from '../correlation-engine/evidence';
import type { DailySeries } from '../correlation-engine/types';

/**
 * True when either lag (same-day or next-day — the same two the
 * correlation engine itself tests, never more) has enough real paired
 * observations, spanning enough elapsed days, with real variation on
 * both sides — everything evaluatePair's base gate requires except the
 * effect-size floor itself. If this is true and the correlation engine
 * still reported 'insufficient_data', the pair was genuinely tested and
 * came back weak, not under-sampled.
 */
export function hasSufficientPairedData(outcomeSeries: DailySeries, driverSeries: DailySeries): boolean {
  for (const paired of [pairSameDay(outcomeSeries, driverSeries), pairNextDay(outcomeSeries, driverSeries)]) {
    if (paired.dates.length < MIN_PAIRED_OBSERVATIONS) continue;
    if (spanDays(paired.dates) < MIN_SPAN_DAYS) continue;
    if (!hasSufficientVariation(paired.outcome) || !hasSufficientVariation(paired.driver)) continue;
    return true;
  }
  return false;
}
