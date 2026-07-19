'use server';

/**
 * Weekly Nutrition Report (Part 11) — server actions. Same conventions as
 * app/actions/food-products.ts: a session-scoped Supabase client, RLS
 * (migration 60) as the real authorization boundary, requireMember()/
 * ActionResult shape. Generation is idempotent per member+week_start (the
 * unique index on weekly_nutrition_reports enforces one row) — if a row
 * already exists for the requested week, it's returned as-is, never
 * recomputed, since a generated report is a point-in-time snapshot (there is
 * deliberately no member UPDATE policy on this table).
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import { resolveLocalDate } from './checkin';
import type { WeeklyNutritionReport } from '@mef/shared-types-contracts';
import { computeWeeklyNutritionReport } from '@/lib/food-lens/weeklyReport';
import {
  getWeeklyNutritionReportForWeek,
  insertWeeklyNutritionReport,
  listRecentWeeklyNutritionReports,
  listWeeklyCompletedWorkoutLocalDates,
  listWeeklyDetectedItemsForReport,
  listWeeklyLogEntriesForReport,
  listWeeklyMealQualityRatingsForReport,
  listWeeklyWaterCupsByLocalDate,
  resolveMemberTimezone,
  weekBoundsFor,
} from '@/lib/food-lens/weeklyReportData';

async function requireMember(): Promise<{
  supabase: ReturnType<typeof createClient>;
  userId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

/**
 * Returns the existing report for the requested member-local week if one
 * has already been generated (or checked and found insufficient), otherwise
 * computes and stores a new one. `weekStartDate` (YYYY-MM-DD) selects an
 * arbitrary past week; omitted, it resolves to the current member-local
 * Monday-start week, mirroring app/actions/food-products.ts's
 * memberLocalDate() pattern for "today."
 */
export async function getOrGenerateWeeklyNutritionReportAction(
  weekStartDate?: string
): Promise<ActionResult & { report?: WeeklyNutritionReport }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const timezone = await resolveMemberTimezone(supabase, userId);

  let weekStart: string;
  let weekEnd: string;
  if (weekStartDate) {
    ({ weekStart, weekEnd } = weekBoundsFor(weekStartDate));
  } else {
    const nowLocalDate = await resolveLocalDate(
      new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
      false
    );
    ({ weekStart, weekEnd } = weekBoundsFor(nowLocalDate));
  }

  const existing = await getWeeklyNutritionReportForWeek(supabase, userId, weekStart);
  if (existing) return { report: existing };

  const [
    logEntries,
    mealQualityRatings,
    detectedItems,
    completedWorkoutLocalDates,
    waterCupsByLocalDate,
  ] = await Promise.all([
    listWeeklyLogEntriesForReport(supabase, userId, weekStart, weekEnd, timezone),
    listWeeklyMealQualityRatingsForReport(supabase, userId, weekStart, weekEnd, timezone),
    listWeeklyDetectedItemsForReport(supabase, userId, weekStart, weekEnd, timezone),
    listWeeklyCompletedWorkoutLocalDates(supabase, userId, weekStart, weekEnd),
    listWeeklyWaterCupsByLocalDate(supabase, userId, weekStart, weekEnd),
  ]);

  const computed = computeWeeklyNutritionReport({
    weekStart,
    weekEnd,
    logEntries,
    mealQualityRatings,
    detectedItems,
    completedWorkoutLocalDates,
    waterCupsByLocalDate,
  });

  const inserted =
    'insufficientData' in computed
      ? await insertWeeklyNutritionReport(supabase, {
          memberId: userId,
          weekStart,
          weekEnd,
          status: 'insufficient_data',
          // Empty on purpose (matches the WeeklyNutritionReportBody |
          // Record<string, never> contract) — the fallback sentence itself
          // is a fixed constant the UI renders directly for any
          // 'insufficient_data' row, so nothing needs to live in `report`
          // to distinguish "checked, not enough yet" from "never checked."
          report: {},
        })
      : await insertWeeklyNutritionReport(supabase, {
          memberId: userId,
          weekStart,
          weekEnd,
          status: 'generated',
          report: computed,
        });

  if (!inserted) return { error: 'Could not generate your weekly nutrition report.' };
  return { report: inserted };
}

export async function listRecentWeeklyNutritionReportsAction(
  limit = 8
): Promise<WeeklyNutritionReport[]> {
  const ctx = await requireMember();
  if (!ctx) return [];
  return listRecentWeeklyNutritionReports(ctx.supabase, ctx.userId, limit);
}
