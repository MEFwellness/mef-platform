/**
 * Case View — the overlay chart's data prep (requirement 4). Pure, no
 * I/O. Reuses the correlation engine's own exported, unmodified
 * extractDailySeries()/addDays() — the real stored values, never
 * recomputed or re-derived.
 */

import { extractDailySeries, type WearableDayValues } from '../correlation-engine/variables';
import { addDays } from '../correlation-engine/pairing';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import type { CandidatePair } from '../correlation-engine/types';
import type { FindingView, OverlaySeries, SeriesPoint } from './types';

function toSortedPoints(series: Map<string, number>): SeriesPoint[] {
  return [...series.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({ date, value }));
}

/**
 * Shifts every point's date forward by one day — used only when a
 * finding's strongest lag is 'next_day', so the driver's value on day d
 * plots at the same x-position as the outcome value it was actually
 * paired against (day d+1). Labeled plainly by the caller, never a
 * silent adjustment.
 */
function shiftForward(points: SeriesPoint[], days: number): SeriesPoint[] {
  if (days === 0) return points;
  return points.map((p) => ({ date: addDays(p.date, days), value: p.value }));
}

export function buildOverlaySeries(
  finding: Pick<FindingView, 'lag'>,
  pair: CandidatePair,
  outcomeLabel: string,
  driverLabel: string,
  checkinsByDate: Map<string, DailyCheckin>,
  wearableByDate: Map<string, WearableDayValues>
): OverlaySeries {
  const outcomeSeries = extractDailySeries(pair.outcomeVariable, checkinsByDate, wearableByDate);
  const driverSeries = extractDailySeries(pair.driverVariable, checkinsByDate, wearableByDate);

  const lagOffsetDays: 0 | 1 = finding.lag === 'next_day' ? 1 : 0;

  return {
    outcomeLabel,
    driverLabel,
    outcomePoints: toSortedPoints(outcomeSeries),
    driverPoints: shiftForward(toSortedPoints(driverSeries), lagOffsetDays),
    lagOffsetDays,
    lagNote:
      lagOffsetDays === 1
        ? `${driverLabel} is shown one day earlier than ${outcomeLabel.toLowerCase()} — this relationship is strongest when it leads by a day.`
        : null,
  };
}
