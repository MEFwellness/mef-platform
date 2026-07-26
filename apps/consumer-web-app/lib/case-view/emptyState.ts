/**
 * Case View — the empty/early state (requirement 6). Pure, no I/O.
 * "How close is each goal-relevant pair to being answerable" reuses the
 * correlation engine's own exported pure functions (pairSameDay/
 * pairNextDay/spanDays, the same MIN_PAIRED_OBSERVATIONS/MIN_SPAN_DAYS
 * thresholds) — never a re-derived or approximate threshold, and never a
 * fabricated finding. This is the same "was there enough data" building
 * block lib/driver-state-engine/dataSufficiency.ts already uses,
 * applied here for progress display instead of state classification.
 */

import { pairNextDay, pairSameDay, spanDays } from '../correlation-engine/pairing';
import { MIN_PAIRED_OBSERVATIONS, MIN_SPAN_DAYS } from '../correlation-engine/evidence';
import { extractDailySeries, type WearableDayValues } from '../correlation-engine/variables';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import type { CandidatePair } from '../correlation-engine/types';
import type { CaseEmptyStateView, EvidenceProgressRow } from './types';

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((new Date(`${toDate}T12:00:00Z`).getTime() - new Date(`${fromDate}T12:00:00Z`).getTime()) / (24 * 60 * 60 * 1000));
}

/** The stronger of the two tested lags, by paired-observation count — mirrors evaluatePair's own "keep whichever lag has more/better evidence" preference, without applying its effect-size gate (this is a progress readout, not a verdict). */
function bestLagProgress(
  outcomeSeries: Map<string, number>,
  driverSeries: Map<string, number>
): { observationCount: number; spanDays: number } {
  const sameDay = pairSameDay(outcomeSeries, driverSeries);
  const nextDay = pairNextDay(outcomeSeries, driverSeries);
  const best = sameDay.dates.length >= nextDay.dates.length ? sameDay : nextDay;
  return { observationCount: best.dates.length, spanDays: spanDays(best.dates) };
}

export function buildStillGatheringRows(
  relevantPairs: readonly CandidatePair[],
  checkinsByDate: Map<string, DailyCheckin>,
  wearableByDate: Map<string, WearableDayValues>
): EvidenceProgressRow[] {
  return relevantPairs.map((pair) => {
    const outcomeSeries = extractDailySeries(pair.outcomeVariable, checkinsByDate, wearableByDate);
    const driverSeries = extractDailySeries(pair.driverVariable, checkinsByDate, wearableByDate);
    const progress = bestLagProgress(outcomeSeries, driverSeries);
    return {
      pairKey: pair.pairKey,
      label: pair.label,
      observationCount: progress.observationCount,
      spanDays: progress.spanDays,
      neededObservations: MIN_PAIRED_OBSERVATIONS,
      neededSpanDays: MIN_SPAN_DAYS,
    };
  });
}

export function buildCaseEmptyState(
  stillGathering: EvidenceProgressRow[],
  checkinsByDate: Map<string, DailyCheckin>,
  todayLocalDate: string
): CaseEmptyStateView {
  const dates = [...checkinsByDate.keys()].sort();
  const firstDate = dates[0] ?? null;

  return {
    checkinCount: checkinsByDate.size,
    daysSinceFirstCheckin: firstDate ? daysBetween(firstDate, todayLocalDate) : null,
    stillGathering: stillGathering.slice().sort((a, b) => b.observationCount - a.observationCount),
  };
}
