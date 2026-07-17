/**
 * Root Score System — raw input fetchers. The only file in lib/scoring/
 * that touches Supabase for *inputs* (lib/scoring/data.ts handles
 * snapshot persistence separately). Deliberately self-contained: rather
 * than importing lib/food-lens/data.ts, lib/movement/data.ts, or
 * lib/body-assessment/data.ts, each fetcher here queries its table
 * directly against the stable, committed schema (migrations 21, 37,
 * 55-58) — this keeps the scoring system isolated from those modules'
 * own in-flight work and from a mid-edit food-lens module currently
 * being extended by another session.
 *
 * Every fetcher is best-effort: a query failure logs and returns an
 * empty array rather than throwing, so one domain's data source being
 * briefly unavailable degrades that one domain to "no data" instead of
 * failing the whole Root Score calculation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BodyAssessment, DailyCheckin, MovementSession } from '@mef/shared-types-contracts';
import { addDaysToLocalDate } from '@/lib/feed/dateMath';
import { RESILIENCE_LOOKBACK_DAYS, ROOT_WINDOW_DAYS } from './config';
import type { MealQualityEvent } from './domains';

/** Oldest-first, spanning RESILIENCE_LOOKBACK_DAYS back — the deepest window any domain or Resilience needs. */
export async function fetchCheckinsForScoring(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<DailyCheckin[]> {
  const since = addDaysToLocalDate(asOfLocalDate, -(RESILIENCE_LOOKBACK_DAYS - 1));
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('*')
    .eq('user_id', memberId)
    .gte('local_date', since)
    .lte('local_date', asOfLocalDate)
    .order('local_date', { ascending: true });

  if (error) {
    console.error('fetchCheckinsForScoring failed', error);
    return [];
  }
  return (data ?? []) as DailyCheckin[];
}

/**
 * One event per analyzed Food Lens scan with a real meal-quality rating,
 * latest rating per scan (ratings are versioned/append-only per migration
 * 56/57). Only 'analyzed'/'member_reviewed' scans qualify — a
 * pending/failed/not_configured scan has no real quality signal yet.
 */
export async function fetchMealQualityEventsForScoring(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<MealQualityEvent[]> {
  const since = addDaysToLocalDate(asOfLocalDate, -(ROOT_WINDOW_DAYS - 1));
  const sinceISO = `${since}T00:00:00.000Z`;

  try {
    const { data: scans, error: scanError } = await supabase
      .from('food_lens_scans')
      .select('id, created_at, status')
      .eq('member_id', memberId)
      .in('status', ['analyzed', 'member_reviewed'])
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(300);

    if (scanError) {
      console.error('fetchMealQualityEventsForScoring (scans) failed', scanError);
      return [];
    }
    if (!scans || scans.length === 0) return [];

    const scanIds = (scans as Array<{ id: string }>).map((s) => s.id);
    const { data: ratings, error: ratingError } = await supabase
      .from('food_lens_meal_quality_ratings')
      .select('scan_id, rating, created_at')
      .in('scan_id', scanIds)
      .order('created_at', { ascending: false });

    if (ratingError) {
      console.error('fetchMealQualityEventsForScoring (ratings) failed', ratingError);
      return [];
    }

    const latestRatingByScan = new Map<string, 'green' | 'yellow' | 'red'>();
    for (const r of (ratings ?? []) as Array<{ scan_id: string; rating: 'green' | 'yellow' | 'red' }>) {
      if (!latestRatingByScan.has(r.scan_id)) latestRatingByScan.set(r.scan_id, r.rating);
    }

    const events: MealQualityEvent[] = [];
    for (const scan of scans as Array<{ id: string; created_at: string }>) {
      const rating = latestRatingByScan.get(scan.id);
      if (rating) events.push({ logged_at: scan.created_at, rating });
    }
    return events;
  } catch (err) {
    console.error('fetchMealQualityEventsForScoring failed', err);
    return [];
  }
}

/** Oldest-first, spanning ROOT_WINDOW_DAYS back. */
export async function fetchMovementSessionsForScoring(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<MovementSession[]> {
  const since = addDaysToLocalDate(asOfLocalDate, -(ROOT_WINDOW_DAYS - 1));
  const { data, error } = await supabase
    .from('movement_sessions')
    .select('*')
    .eq('member_id', memberId)
    .gte('local_date', since)
    .lte('local_date', asOfLocalDate)
    .order('local_date', { ascending: true });

  if (error) {
    console.error('fetchMovementSessionsForScoring failed', error);
    return [];
  }
  return (data ?? []) as MovementSession[];
}

/** Completed (non-archived) structural assessments, oldest-first, spanning ROOT_WINDOW_DAYS back. */
export async function fetchBodyAssessmentsForScoring(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<BodyAssessment[]> {
  const since = addDaysToLocalDate(asOfLocalDate, -(ROOT_WINDOW_DAYS - 1));
  const { data, error } = await supabase
    .from('body_assessments')
    .select('*')
    .eq('member_id', memberId)
    .not('completed_at', 'is', null)
    .neq('status', 'archived')
    .gte('local_date', since)
    .lte('local_date', asOfLocalDate)
    .order('local_date', { ascending: true });

  if (error) {
    console.error('fetchBodyAssessmentsForScoring failed', error);
    return [];
  }
  return (data ?? []) as BodyAssessment[];
}
