/**
 * Coaching Intelligence Engine — Daily Check-ins data source. Reads
 * daily_checkins_current (the "latest version per user/local_date" view,
 * same convention every other check-in-reading query in this codebase
 * follows — see lib/food-lens/weeklyReportData.ts's
 * listWeeklyWaterCupsByLocalDate) and normalizes it into
 * CoachingObservation[]s.
 *
 * Member-reported 1-5 ratings (digestion, energy, stress, mood, sleep
 * quality) are classified low/high directly against that fixed scale —
 * this is reading the member's own explicit self-rating, not inventing an
 * external clinical threshold. water_cups has no such fixed scale, so this
 * source deliberately does NOT classify its direction here; it reports the
 * raw value as 'neutral' and leaves any low/high judgment to a level
 * generator that can compare it against the member's own trailing values
 * (a relative read, never an invented absolute guideline) — keeping every
 * "is this actually notable" decision in levels.ts, not duplicated per
 * source.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CoachingDataSourceProvider,
  CoachingDateRange,
  CoachingObservation,
  CoachingObservationDirection,
} from '../types';

type CheckinRow = {
  id: string;
  local_date: string;
  digestion_rating: number | null;
  energy_level: number | null;
  stress_level: number | null;
  mood_level: number | null;
  sleep_quality: number | null;
  water_cups: number | null;
};

/** value<=2 -> low, value>=4 -> high, 3 -> neutral — the member's own fixed 1-5 self-rating scale, not an external guideline. */
function ratingDirection(value: number): CoachingObservationDirection {
  if (value <= 2) return 'low';
  if (value >= 4) return 'high';
  return 'neutral';
}

const RATING_METRICS: Array<{ column: keyof CheckinRow; metric: string }> = [
  { column: 'digestion_rating', metric: 'digestion_rating' },
  { column: 'energy_level', metric: 'energy_level' },
  { column: 'stress_level', metric: 'stress_level' },
  { column: 'mood_level', metric: 'mood_level' },
  { column: 'sleep_quality', metric: 'sleep_quality' },
];

async function fetchObservations(
  supabase: SupabaseClient,
  memberId: string,
  range: CoachingDateRange
): Promise<CoachingObservation[]> {
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select(
      'id, local_date, digestion_rating, energy_level, stress_level, mood_level, sleep_quality, water_cups'
    )
    .eq('user_id', memberId)
    .gte('local_date', range.from)
    .lte('local_date', range.to)
    .order('local_date', { ascending: true });

  if (error) {
    console.error('checkinSource.fetchObservations failed', error);
    return [];
  }

  const observations: CoachingObservation[] = [];
  for (const row of (data ?? []) as CheckinRow[]) {
    for (const { column, metric } of RATING_METRICS) {
      const value = row[column];
      if (typeof value !== 'number') continue;
      observations.push({
        sourceId: 'daily_checkin',
        localDate: row.local_date,
        metric,
        direction: ratingDirection(value),
        value,
        confidence: 1, // a direct member self-report, not a derived estimate
        sourceRecordId: row.id,
      });
    }

    if (typeof row.water_cups === 'number') {
      observations.push({
        sourceId: 'daily_checkin',
        localDate: row.local_date,
        metric: 'water_cups',
        direction: 'neutral',
        value: row.water_cups,
        confidence: 1,
        sourceRecordId: row.id,
      });
    }
  }

  return observations;
}

export const checkinSourceProvider: CoachingDataSourceProvider = {
  id: 'daily_checkin',
  fetchObservations,
};
