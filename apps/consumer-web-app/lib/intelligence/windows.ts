/**
 * Longitudinal Analysis Windows (section 1) — pure date-range slicing
 * over already-fetched history. Reuses lib/feed/dateMath.ts's plain
 * YYYY-MM-DD arithmetic (the same "these are calendar strings, not
 * instants" convention already established there) rather than a second
 * date library or ad hoc Date math.
 */

import type {
  DailyCheckin,
  WellnessInsightEvidenceRef,
  WellnessIntelligenceTimeWindow,
} from '@mef/shared-types-contracts';
import { addDaysToLocalDate } from '../feed/dateMath';

export type FixedWindow = Extract<
  WellnessIntelligenceTimeWindow,
  | 'last_7_days'
  | 'previous_7_days'
  | 'last_14_days'
  | 'last_30_days'
  | 'previous_30_days'
  | 'last_90_days'
>;

export type LocalDateRange = { start: string; end: string };

/** [start, end] inclusive, both plain local_date strings, anchored at `asOfLocalDate`. */
export function windowRange(asOfLocalDate: string, window: FixedWindow): LocalDateRange {
  switch (window) {
    case 'last_7_days':
      return { start: addDaysToLocalDate(asOfLocalDate, -6), end: asOfLocalDate };
    case 'previous_7_days':
      return {
        start: addDaysToLocalDate(asOfLocalDate, -13),
        end: addDaysToLocalDate(asOfLocalDate, -7),
      };
    case 'last_14_days':
      return { start: addDaysToLocalDate(asOfLocalDate, -13), end: asOfLocalDate };
    case 'last_30_days':
      return { start: addDaysToLocalDate(asOfLocalDate, -29), end: asOfLocalDate };
    case 'previous_30_days':
      return {
        start: addDaysToLocalDate(asOfLocalDate, -59),
        end: addDaysToLocalDate(asOfLocalDate, -30),
      };
    case 'last_90_days':
      return { start: addDaysToLocalDate(asOfLocalDate, -89), end: asOfLocalDate };
  }
}

export function sliceByLocalDate<T extends { local_date: string }>(
  itemsOldestFirst: T[],
  range: LocalDateRange
): T[] {
  return itemsOldestFirst.filter(
    (item) => item.local_date >= range.start && item.local_date <= range.end
  );
}

/** Same evidence-pointer convention lib/narrative/generator.ts already uses for a range of check-ins — a compact, real, auditable reference rather than one row per day. */
export function checkinRangeEvidence(checkins: DailyCheckin[]): WellnessInsightEvidenceRef[] {
  if (checkins.length === 0) return [];
  return [
    {
      type: 'daily_checkin_range',
      id: `${checkins[0]!.id}..${checkins[checkins.length - 1]!.id}`,
      note: `${checkins.length} check-in${checkins.length === 1 ? '' : 's'}`,
    },
  ];
}
