/**
 * ONE ANSWER TO "HOW MUCH HAS SHE LOGGED" (Build 2, 2026-08-27).
 *
 * Home said "You have 3 logged days so far" under her Root Score and, two
 * scrolls down in the same brief, "You've logged 4 check-ins with me so
 * far". Today said 4. The coach's screen said 3. Every one of those
 * numbers was arithmetically correct and every one of them was counted by
 * a different piece of code over a different span, and not one of them
 * said which span it was, so a member reading her own screen found the app
 * disagreeing with itself about her.
 *
 * There are exactly two real figures, and this file is where both of them
 * come from:
 *
 *   allTimeLoggedDays   every day she has ever logged a check-in.
 *   windowLoggedDays    the days she logged inside the evidence window,
 *                       which is the span every interpretation, data floor
 *                       and Root Score claim is actually computed over.
 *
 * THEY ARE NOT TWO CONCEPTS. `daily_checkins_current` returns exactly one
 * row per member per local_date (see its view definition, migration 13 and
 * onwards), so "check-ins logged" and "days logged" are the same number in
 * this schema. That is why the fix is not to name them differently: it is
 * to make every all-time surface print the same number, and to make every
 * windowed sentence say out loud which window it means. A sentence that
 * quotes `windowLoggedDays` without naming `windowDays` is the bug this
 * file exists to stop.
 *
 * No new table and no new day-boundary maths: local_date is already
 * stamped at write time in the member's own timezone (see
 * lib/time/localDate.ts), so counting distinct local_date values is the
 * timezone-correct count and never needs recomputing on read.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysToLocalDate } from '@/lib/feed/dateMath';
import { EVIDENCE_WINDOW_DAYS } from '@/lib/member-interpretation/config';

/**
 * Distinct days with a check-in, from rows already in hand.
 *
 * The one definition of the count. Callers that have already fetched a
 * member's check-ins use this instead of writing `new Set(...).size` again,
 * which is how four surfaces ended up each owning their own version of the
 * same idea.
 */
export function countLoggedDays(rows: ReadonlyArray<{ local_date: string }>): number {
  return new Set(rows.map((row) => row.local_date)).size;
}

export type LoggedDayTotals = {
  /** Every day she has ever logged. The number every "so far" sentence must use. */
  allTimeLoggedDays: number;
  /** Her very first logged day, or null when she has never logged one. */
  firstLoggedLocalDate: string | null;
};

export type MemberCheckinCounts = LoggedDayTotals & {
  /** Days logged inside the window below, and never quoted without naming it. */
  windowLoggedDays: number;
  /** How many days the window covers. */
  windowDays: number;
};

/** Her all-time totals, in one round trip. Never windowed, so it can only ever go up. */
export async function getLoggedDayTotals(
  supabase: SupabaseClient,
  memberId: string
): Promise<LoggedDayTotals> {
  const [{ count, error: countError }, { data: firstRow, error: firstError }] = await Promise.all([
    supabase
      .from('daily_checkins_current')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', memberId),
    supabase
      .from('daily_checkins_current')
      .select('local_date')
      .eq('user_id', memberId)
      .order('local_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (countError || firstError) {
    console.error('getLoggedDayTotals failed', countError ?? firstError);
    return { allTimeLoggedDays: 0, firstLoggedLocalDate: null };
  }

  return {
    allTimeLoggedDays: count ?? 0,
    firstLoggedLocalDate: (firstRow?.local_date as string | undefined) ?? null,
  };
}

/**
 * Both figures for one member, for a surface that shows both.
 *
 * `todayLocalDate` is the member's own local date (lib/time/localDate.ts),
 * never a server date: the window's near edge is a day she has lived.
 */
export async function getMemberCheckinCounts(
  supabase: SupabaseClient,
  memberId: string,
  todayLocalDate: string,
  windowDays: number = EVIDENCE_WINDOW_DAYS
): Promise<MemberCheckinCounts> {
  const since = addDaysToLocalDate(todayLocalDate, -(windowDays - 1));
  const [totals, windowResult] = await Promise.all([
    getLoggedDayTotals(supabase, memberId),
    supabase
      .from('daily_checkins_current')
      .select('local_date')
      .eq('user_id', memberId)
      .gte('local_date', since)
      .lte('local_date', todayLocalDate),
  ]);

  if (windowResult.error) {
    console.error('getMemberCheckinCounts window read failed', windowResult.error);
    return { ...totals, windowLoggedDays: 0, windowDays };
  }

  return {
    ...totals,
    windowLoggedDays: countLoggedDays((windowResult.data ?? []) as Array<{ local_date: string }>),
    windowDays,
  };
}
