/**
 * Coaching Intelligence Engine — Food Lens data source. Reads
 * food_lens_pattern_comparisons (via the same accessor Food Lens's own
 * coaching narrative uses, lib/food-lens/data.ts's
 * listRecentFoodLensComparisonsForMember) rather than registry_entries:
 * the registry's Food Lens adapter (lib/registry/adapters/foodLens.ts)
 * deliberately collapses a comparison down to one coarse
 * severity ('none'/'mild'), which is enough for the Intelligence Engine's
 * purposes but not enough here — a Level 1/2/3 statement needs to say
 * *which* macro dimension (protein/carb/fat) ran heavy or light, and only
 * the source comparison row's own `signals` array carries that. This is
 * still real, already-computed, deterministic data (lib/food-lens/
 * comparison.ts) — never re-derived or guessed at by this source.
 *
 * A generous limit (not a tight date filter at the query level) is used
 * because the existing accessor doesn't take a date range, and a single
 * member's Food Lens history is small enough that filtering in memory
 * after the fetch is cheap; if that stops being true this should grow a
 * date-ranged variant in lib/food-lens/data.ts instead of duplicating the
 * query here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listRecentFoodLensComparisonsForMember } from '@/lib/food-lens/data';
import { resolveMemberTimezone } from '@/lib/food-lens/weeklyReportData';
import { localDateStringFor } from '@/lib/time/localDate';
import type {
  CoachingDataSourceProvider,
  CoachingDateRange,
  CoachingObservation,
  CoachingObservationDirection,
} from '../types';

const FETCH_LIMIT = 120;

function directionFor(signalDirection: 'match' | 'heavy' | 'light'): CoachingObservationDirection {
  if (signalDirection === 'heavy') return 'high';
  if (signalDirection === 'light') return 'low';
  return 'neutral';
}

async function fetchObservations(
  supabase: SupabaseClient,
  memberId: string,
  range: CoachingDateRange
): Promise<CoachingObservation[]> {
  const [timezone, recent] = await Promise.all([
    resolveMemberTimezone(supabase, memberId),
    listRecentFoodLensComparisonsForMember(supabase, memberId, FETCH_LIMIT),
  ]);

  const observations: CoachingObservation[] = [];
  for (const { comparison } of recent) {
    const localDate = localDateStringFor(comparison.created_at, timezone);
    if (localDate < range.from || localDate > range.to) continue;

    for (const signal of comparison.signals) {
      observations.push({
        sourceId: 'food_lens',
        localDate,
        metric: signal.dimension, // 'protein' | 'carb' | 'fat'
        direction: directionFor(signal.direction),
        value: signal.mealLevel,
        confidence: comparison.confidence,
        sourceRecordId: comparison.id,
      });
    }
  }

  return observations;
}

export const nutritionSourceProvider: CoachingDataSourceProvider = {
  id: 'food_lens',
  fetchObservations,
};
