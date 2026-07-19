/**
 * Data access for the Weekly Nutrition Report (Part 11). Pure functions
 * taking a SupabaseClient, same convention as lib/food-lens/data.ts and
 * lib/food-products/data.ts (RLS is the real authorization boundary) — kept
 * in its own file per this feature's build note, rather than added to
 * either of those two files, since other work is in flight there.
 *
 * Every read here resolves member-local calendar dates from absolute
 * timestamptz columns using the member's stored timezone (profiles.timezone),
 * the same source app/actions/food-products.ts's memberLocalDate() already
 * reads. week_start/week_end are member-local Monday-start dates (matching
 * the check-in system's convention), computed with pure calendar-day
 * arithmetic — never with a Date constructed from "now," since a report can
 * be generated for a week that's already over.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { FoodRulesEngineResult } from '@mef/shared-types-contracts';
import type {
  WeeklyNutritionReport,
  WeeklyNutritionReportBody,
  WeeklyNutritionReportStatus,
} from '@mef/shared-types-contracts';
import type {
  WeeklyReportDetectedItem,
  WeeklyReportLogEntry,
  WeeklyReportMealQualityRating,
  WeeklyReportPackagedFoodSignal,
} from './weeklyReport';

// ---------------------------------------------------------------------------
// Timezone-aware date helpers
// ---------------------------------------------------------------------------

/** Member-local calendar date (YYYY-MM-DD) for an absolute timestamp, in a given IANA timezone. */
export function toLocalDateString(isoTimestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoTimestamp));
}

/** The UTC instant corresponding to local midnight of `localDateStr` in `timezone`. */
export function localMidnightUtcIso(localDateStr: string, timezone: string): string {
  const utcGuess = new Date(`${localDateStr}T00:00:00.000Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(utcGuess);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === '24' ? 0 : Number(map.hour);
  const asIfUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second)
  );
  const trueInstant = 2 * utcGuess.getTime() - asIfUtc;
  return new Date(trueInstant).toISOString();
}

/** Adds `days` calendar days to a YYYY-MM-DD date string (pure calendar arithmetic, no timezone involved). */
export function addCalendarDays(localDateStr: string, days: number): string {
  const d = new Date(`${localDateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday-start week (week_start inclusive, week_end exclusive, both YYYY-MM-DD) containing `localDateStr`. */
export function weekBoundsFor(localDateStr: string): { weekStart: string; weekEnd: string } {
  const d = new Date(`${localDateStr}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  const weekStart = addCalendarDays(localDateStr, -daysSinceMonday);
  const weekEnd = addCalendarDays(weekStart, 7);
  return { weekStart, weekEnd };
}

export async function resolveMemberTimezone(
  supabase: SupabaseClient,
  memberId: string
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', memberId).single();
  return data?.timezone ?? 'America/New_York';
}

// ---------------------------------------------------------------------------
// Reads feeding WeeklyReportInput
// ---------------------------------------------------------------------------

/** member_food_log rows for the week, each augmented with its scan's food_analysis_results.rules_result judgments when one exists (barcode/label-scanned packaged products). */
export async function listWeeklyLogEntriesForReport(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string,
  weekEnd: string,
  timezone: string
): Promise<WeeklyReportLogEntry[]> {
  const startIso = localMidnightUtcIso(weekStart, timezone);
  const endIso = localMidnightUtcIso(weekEnd, timezone);

  const { data, error } = await supabase
    .from('member_food_log')
    .select('meal_category, consumed_at, scan_id')
    .eq('member_id', memberId)
    .gte('consumed_at', startIso)
    .lt('consumed_at', endIso);

  if (error) {
    console.error('listWeeklyLogEntriesForReport failed', error);
    return [];
  }

  const rows = data as Array<{
    meal_category: string;
    consumed_at: string;
    scan_id: string | null;
  }>;
  const scanIds = [
    ...new Set(rows.map((r) => r.scan_id).filter((id): id is string => Boolean(id))),
  ];

  const signalByScanId = new Map<string, WeeklyReportPackagedFoodSignal>();
  if (scanIds.length > 0) {
    const { data: analyses, error: analysisError } = await supabase
      .from('food_analysis_results')
      .select('scan_id, rules_result, created_at')
      .in('scan_id', scanIds)
      .order('created_at', { ascending: false });
    if (analysisError) {
      console.error(
        'listWeeklyLogEntriesForReport: food_analysis_results lookup failed',
        analysisError
      );
    } else {
      for (const row of analyses as Array<{
        scan_id: string;
        rules_result: Partial<FoodRulesEngineResult>;
      }>) {
        // Rows arrive newest-first; keep only the first (latest) per scan_id.
        if (signalByScanId.has(row.scan_id)) continue;
        const rr = row.rules_result ?? {};
        signalByScanId.set(row.scan_id, {
          processingLabel: rr.processingContext?.label ?? 'moderately_processed',
          isMeaningfulProtein: Boolean(rr.proteinQuality?.isMeaningfulAmount),
          fiberG: rr.carbQuality?.fiberG ?? null,
          addedSugarG: rr.carbQuality?.addedSugarG ?? null,
        });
      }
    }
  }

  return rows.map((row) => ({
    localDate: toLocalDateString(row.consumed_at, timezone),
    mealCategory: row.meal_category as WeeklyReportLogEntry['mealCategory'],
    packagedFoodSignal: row.scan_id ? (signalByScanId.get(row.scan_id) ?? null) : null,
  }));
}

/** Latest food_lens_meal_quality_ratings row per meal-photo scan created within the week. */
export async function listWeeklyMealQualityRatingsForReport(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string,
  weekEnd: string,
  timezone: string
): Promise<WeeklyReportMealQualityRating[]> {
  const startIso = localMidnightUtcIso(weekStart, timezone);
  const endIso = localMidnightUtcIso(weekEnd, timezone);

  const { data: scans, error: scansError } = await supabase
    .from('food_lens_scans')
    .select('id, created_at')
    .eq('member_id', memberId)
    .gte('created_at', startIso)
    .lt('created_at', endIso);

  if (scansError) {
    console.error('listWeeklyMealQualityRatingsForReport: scan lookup failed', scansError);
    return [];
  }

  const scanRows = scans as Array<{ id: string; created_at: string }>;
  if (scanRows.length === 0) return [];

  const scanIds = scanRows.map((s) => s.id);
  const localDateByScanId = new Map(
    scanRows.map((s) => [s.id, toLocalDateString(s.created_at, timezone)])
  );

  const { data: ratings, error: ratingsError } = await supabase
    .from('food_lens_meal_quality_ratings')
    .select(
      'scan_id, rating, nutrient_density, added_sugar_level, processing_level, has_meaningful_protein, has_meaningful_fiber, has_healthy_fat, is_beverage, created_at'
    )
    .in('scan_id', scanIds)
    .order('created_at', { ascending: false });

  if (ratingsError) {
    console.error('listWeeklyMealQualityRatingsForReport: ratings lookup failed', ratingsError);
    return [];
  }

  type RatingRow = {
    scan_id: string;
    rating: WeeklyReportMealQualityRating['rating'];
    nutrient_density: WeeklyReportMealQualityRating['nutrientDensity'];
    added_sugar_level: WeeklyReportMealQualityRating['addedSugarLevel'];
    processing_level: WeeklyReportMealQualityRating['processingLevel'];
    has_meaningful_protein: boolean;
    has_meaningful_fiber: boolean;
    has_healthy_fat: boolean;
    is_beverage: boolean;
  };

  const seen = new Set<string>();
  const result: WeeklyReportMealQualityRating[] = [];
  for (const row of ratings as RatingRow[]) {
    if (seen.has(row.scan_id)) continue; // keep only the latest (versioned) rating per scan
    seen.add(row.scan_id);
    const localDate = localDateByScanId.get(row.scan_id);
    if (!localDate) continue;
    result.push({
      localDate,
      rating: row.rating,
      nutrientDensity: row.nutrient_density,
      addedSugarLevel: row.added_sugar_level,
      processingLevel: row.processing_level,
      hasMeaningfulProtein: row.has_meaningful_protein,
      hasMeaningfulFiber: row.has_meaningful_fiber,
      hasHealthyFat: row.has_healthy_fat,
      isBeverage: row.is_beverage,
    });
  }
  return result;
}

/** Confirmed food_lens_detected_items across this week's meal-photo scans — the basis for food variety / vegetable & fruit variety counting. */
export async function listWeeklyDetectedItemsForReport(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string,
  weekEnd: string,
  timezone: string
): Promise<WeeklyReportDetectedItem[]> {
  const startIso = localMidnightUtcIso(weekStart, timezone);
  const endIso = localMidnightUtcIso(weekEnd, timezone);

  const { data: scans, error: scansError } = await supabase
    .from('food_lens_scans')
    .select('id, created_at')
    .eq('member_id', memberId)
    .gte('created_at', startIso)
    .lt('created_at', endIso);

  if (scansError) {
    console.error('listWeeklyDetectedItemsForReport: scan lookup failed', scansError);
    return [];
  }

  const scanRows = scans as Array<{ id: string; created_at: string }>;
  if (scanRows.length === 0) return [];

  const scanIds = scanRows.map((s) => s.id);
  const localDateByScanId = new Map(
    scanRows.map((s) => [s.id, toLocalDateString(s.created_at, timezone)])
  );

  const { data: items, error: itemsError } = await supabase
    .from('food_lens_detected_items')
    .select('scan_id, label, category')
    .in('scan_id', scanIds)
    .eq('status', 'confirmed');

  if (itemsError) {
    console.error('listWeeklyDetectedItemsForReport: items lookup failed', itemsError);
    return [];
  }

  return (items as Array<{ scan_id: string; label: string; category: string }>)
    .map((row) => {
      const localDate = localDateByScanId.get(row.scan_id);
      if (!localDate) return null;
      return {
        localDate,
        label: row.label,
        category: row.category as WeeklyReportDetectedItem['category'],
      };
    })
    .filter((r): r is WeeklyReportDetectedItem => r !== null);
}

/** Distinct member-local dates a movement session reached status='completed' this week. Returns [] if Movement Intelligence has no rows for this member/week — never fabricated. */
export async function listWeeklyCompletedWorkoutLocalDates(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string,
  weekEnd: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('movement_sessions')
    .select('local_date')
    .eq('member_id', memberId)
    .eq('status', 'completed')
    .gte('local_date', weekStart)
    .lt('local_date', weekEnd);

  if (error) {
    console.error('listWeeklyCompletedWorkoutLocalDates failed', error);
    return [];
  }
  return [...new Set((data as Array<{ local_date: string }>).map((r) => r.local_date))];
}

/** member-local date -> water_cups, for this week's daily_checkins rows that actually recorded a value. Returns {} when hydration isn't tracked for this member/week — never fabricated. */
export async function listWeeklyWaterCupsByLocalDate(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string,
  weekEnd: string
): Promise<Record<string, number>> {
  // daily_checkins is append-only/versioned (checkin_version) — read through
  // daily_checkins_current (the "latest version per user/local_date" view),
  // same convention app/actions/checkin.ts already follows, so a
  // resubmitted check-in doesn't double-count or read a stale water_cups.
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('local_date, water_cups')
    .eq('user_id', memberId)
    .gte('local_date', weekStart)
    .lt('local_date', weekEnd)
    .not('water_cups', 'is', null);

  if (error) {
    console.error('listWeeklyWaterCupsByLocalDate failed', error);
    return {};
  }

  const result: Record<string, number> = {};
  for (const row of data as Array<{ local_date: string; water_cups: number }>) {
    result[row.local_date] = row.water_cups;
  }
  return result;
}

// ---------------------------------------------------------------------------
// weekly_nutrition_reports read/write
// ---------------------------------------------------------------------------

export async function getWeeklyNutritionReportForWeek(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string
): Promise<WeeklyNutritionReport | null> {
  const { data, error } = await supabase
    .from('weekly_nutrition_reports')
    .select('*')
    .eq('member_id', memberId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) {
    console.error('getWeeklyNutritionReportForWeek failed', error);
    return null;
  }
  return data as WeeklyNutritionReport | null;
}

export async function insertWeeklyNutritionReport(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    weekStart: string;
    weekEnd: string;
    status: WeeklyNutritionReportStatus;
    report: WeeklyNutritionReportBody | Record<string, never>;
  }
): Promise<WeeklyNutritionReport | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('weekly_nutrition_reports').insert({
    id,
    member_id: input.memberId,
    week_start: input.weekStart,
    week_end: input.weekEnd,
    status: input.status,
    report: input.report,
    created_at: now,
  });

  if (error) {
    console.error('insertWeeklyNutritionReport failed', error);
    return null;
  }

  return {
    id,
    member_id: input.memberId,
    week_start: input.weekStart,
    week_end: input.weekEnd,
    status: input.status,
    report: input.report,
    created_at: now,
  };
}

/** Newest week first. */
export async function listRecentWeeklyNutritionReports(
  supabase: SupabaseClient,
  memberId: string,
  limit = 8
): Promise<WeeklyNutritionReport[]> {
  const { data, error } = await supabase
    .from('weekly_nutrition_reports')
    .select('*')
    .eq('member_id', memberId)
    .order('week_start', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('listRecentWeeklyNutritionReports failed', error);
    return [];
  }
  return data as WeeklyNutritionReport[];
}
