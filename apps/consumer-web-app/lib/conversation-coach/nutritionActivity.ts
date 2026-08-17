/**
 * What the member has actually logged about food, as DATA.
 *
 * Part of the inherited fixes in the interpretation build (2026-08-17).
 *
 * The trust cleanup retired two registry adapters that turned a single
 * logged food into a permanent, member-visible Root Map finding whose
 * narrative carried the food's own name. A product name a member typed
 * became a standing statement about her health, in two domains at once,
 * with the same weight as an assessment result. Twenty such rows existed in
 * production; all were retired.
 *
 * Retiring them was correct and is not being undone. What was left behind
 * was a gap: Root could no longer see that a member had logged anything at
 * all, so it could not say "you have logged most days this week" or notice
 * that she had stopped. This closes that gap on the other side of the line.
 *
 * The line, precisely:
 *
 *   DATA is how much she logged, when, and how much protein it came to.
 *   These are facts about her behaviour, they carry no verdict, they never
 *   become a finding, and they expire the moment they stop being true.
 *
 *   A FINDING is a standing statement about her health. Nothing here can
 *   become one, and the strongest guarantee of that is the shape of the
 *   type below: it contains three numbers and no strings. There is no field
 *   a food name could travel in.
 *
 * The Intelligence Engine already reads food this way, through
 * lib/coaching-insights/sources/nutritionSource.ts, which reads the real
 * comparison rows and emits normalised observations rather than findings.
 * This is the Conversation Coach's equivalent.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysToLocalDate } from '../feed/dateMath';

/**
 * Three counts. No names, no verdicts, no strings at all.
 *
 * If a future change wants to add a food name here, that is the moment to
 * re-read this file's header rather than the moment to add a field.
 */
export type NutritionActivity = {
  /** How many food entries she logged in the window. */
  entriesLogged: number;
  /** How many distinct days she logged anything on. */
  daysLogged: number;
  /** The length of the window, so a sentence built from this can state it. */
  windowDays: number;
};

const WINDOW_DAYS = 7;

export const EMPTY_NUTRITION_ACTIVITY: NutritionActivity = {
  entriesLogged: 0,
  daysLogged: 0,
  windowDays: WINDOW_DAYS,
};

/**
 * Pure: raw timestamps to counts. Separated so the counting rule is
 * testable without a database, and so "two entries on one day is one day"
 * is asserted rather than assumed.
 */
export function countNutritionActivity(consumedAtIsoDates: readonly string[]): NutritionActivity {
  return {
    entriesLogged: consumedAtIsoDates.length,
    daysLogged: new Set(consumedAtIsoDates.map((iso) => iso.slice(0, 10))).size,
    windowDays: WINDOW_DAYS,
  };
}

/**
 * Reads `member_food_log` directly, selecting ONE column: when the entry was
 * consumed. Not the product, not the scan, not the meal category. A query
 * that cannot return a name cannot leak one.
 *
 * Fail-safe: any error resolves to zero activity rather than throwing,
 * because the only caller is a conversation the member is waiting on.
 */
export async function fetchNutritionActivity(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<NutritionActivity> {
  const since = addDaysToLocalDate(localDate, -(WINDOW_DAYS - 1));

  const { data, error } = await supabase
    .from('member_food_log')
    .select('consumed_at')
    .eq('member_id', memberId)
    .gte('consumed_at', `${since}T00:00:00.000Z`);

  if (error) {
    console.error('fetchNutritionActivity failed', error);
    return EMPTY_NUTRITION_ACTIVITY;
  }

  return countNutritionActivity(
    ((data ?? []) as Array<{ consumed_at: string }>).map((row) => row.consumed_at)
  );
}

/**
 * The one sentence this becomes in Root's context. Plain counts, explicitly
 * labelled as behaviour rather than as a finding, so the model cannot
 * reasonably restate it as a conclusion about her health.
 */
export function nutritionActivityLine(activity: NutritionActivity): string {
  if (activity.entriesLogged === 0) {
    return `- Food logging: nothing logged in the last ${activity.windowDays} days. This is a fact about logging, not about how she is eating, and it is not a finding about her.`;
  }
  const dayWord = activity.daysLogged === 1 ? 'day' : 'days';
  const entryWord = activity.entriesLogged === 1 ? 'entry' : 'entries';
  return `- Food logging: ${activity.entriesLogged} ${entryWord} across ${activity.daysLogged} ${dayWord} in the last ${activity.windowDays} days. This is a fact about logging, not a verdict on her diet, and it is not a finding about her. Never name a specific food or product back to her from this.`;
}
