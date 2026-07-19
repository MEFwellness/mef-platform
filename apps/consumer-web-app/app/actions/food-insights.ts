'use server';

/**
 * Daily Nutrition Coaching (Part 6), Meal Timing Intelligence (Part 10), and
 * Meal/Food History Intelligence's 30-day view (Part 5). Reuses the exact
 * data-access functions the Weekly Nutrition Report already built
 * (lib/food-lens/weeklyReportData.ts) over different date windows — one
 * "read member_food_log/meal-quality/detected-items for a date range" layer
 * feeding three different pure analysis functions, rather than three
 * separate data layers.
 */

import { createClient } from '@/lib/supabase/server';
import {
  listWeeklyCompletedWorkoutLocalDates,
  listWeeklyDetectedItemsForReport,
  listWeeklyLogEntriesForReport,
  listWeeklyMealQualityRatingsForReport,
  resolveMemberTimezone,
  toLocalDateString,
  addCalendarDays,
} from '@/lib/food-lens/weeklyReportData';
import {
  computeDailyCoachingMessage,
  type DailyCoachingResult,
} from '@/lib/food-lens/dailyCoaching';
import {
  computeHistoryPatterns,
  type HistoryPatternsResult,
} from '@/lib/food-lens/historyPatterns';

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

export async function getTodaysCoachingMessageAction(): Promise<DailyCoachingResult> {
  const ctx = await requireMember();
  if (!ctx) return { messages: [], insufficientToday: true };
  const { supabase, userId } = ctx;

  const timezone = await resolveMemberTimezone(supabase, userId);
  const nowIso = new Date().toISOString();
  const today = toLocalDateString(nowIso, timezone);
  const tomorrow = addCalendarDays(today, 1);
  const localHour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(
      new Date(nowIso)
    )
  );

  const [logEntries, mealQualityRatings, workoutDates] = await Promise.all([
    listWeeklyLogEntriesForReport(supabase, userId, today, tomorrow, timezone),
    listWeeklyMealQualityRatingsForReport(supabase, userId, today, tomorrow, timezone),
    listWeeklyCompletedWorkoutLocalDates(supabase, userId, today, tomorrow),
  ]);

  return computeDailyCoachingMessage({
    localHour,
    logEntries: logEntries.map((e) => ({
      mealCategory: e.mealCategory,
      packagedFoodSignal: e.packagedFoodSignal ?? null,
    })),
    mealQualityRatings,
    hasWorkoutToday: workoutDates.includes(today),
  });
}

export async function getHistoryPatternsAction(
  windowDays: 7 | 30 = 30
): Promise<HistoryPatternsResult> {
  const ctx = await requireMember();
  if (!ctx) return { insufficientData: true, message: 'Sign in to see your patterns.' };
  const { supabase, userId } = ctx;

  const timezone = await resolveMemberTimezone(supabase, userId);
  const today = toLocalDateString(new Date().toISOString(), timezone);
  const windowStart = addCalendarDays(today, -windowDays);
  const windowEnd = addCalendarDays(today, 1);

  const [logEntries, mealQualityRatings, detectedItems] = await Promise.all([
    listWeeklyLogEntriesForReport(supabase, userId, windowStart, windowEnd, timezone),
    listWeeklyMealQualityRatingsForReport(supabase, userId, windowStart, windowEnd, timezone),
    listWeeklyDetectedItemsForReport(supabase, userId, windowStart, windowEnd, timezone),
  ]);

  return computeHistoryPatterns({ windowDays, logEntries, mealQualityRatings, detectedItems });
}
