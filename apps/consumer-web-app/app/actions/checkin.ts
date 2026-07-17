/**
 * apps/consumer-web-app/app/actions/checkin.ts
 *
 * Exports required by the dashboard: getTodaysCheckin, getRecentCheckins,
 * resolveLocalDate. Also included: submitDailyCheckin (used by the
 * check-in form) and the habit-log helpers, since they're part of the same
 * feature and don't cost anything to keep.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { DailyCheckinInput, DailyCheckin, Habit } from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';
import { emitAndDispatch } from '@/lib/ai/events';
import { buildRuleFacts } from '@/lib/ai/rules/facts';
import { evaluateConcern } from '@/lib/safety/service';
import { recordSafetyRestrictionNarrative } from '@/lib/narrative/service';
import { recordTimelineEvent } from '@/lib/timeline/data';
import { getOrCalculateRootScore } from '@/lib/scoring/service';

// ---- Time helpers ----

/**
 * Late-checkin grace window: a submission within 6 hours after local
 * midnight may target the previous local_date. Must be async — every
 * export from a 'use server' file has to be an async function in Next.js,
 * even one that doesn't await anything internally.
 */
export async function resolveLocalDate(
  nowInTz: Date,
  requestedYesterday: boolean
): Promise<string> {
  const hoursSinceMidnight = nowInTz.getHours() + nowInTz.getMinutes() / 60;
  const canLogYesterday = hoursSinceMidnight < 6;

  const target = new Date(nowInTz);
  if (requestedYesterday && canLogYesterday) {
    target.setDate(target.getDate() - 1);
  }
  return target.toISOString().slice(0, 10);
}

// ---- Check-in read/write ----

export async function submitDailyCheckin(input: DailyCheckinInput): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase.rpc('submit_daily_checkin', {
    p_timezone: input.timezone,
    p_local_date: input.local_date,
    p_mood_level: input.mood_level,
    p_sleep_quality: input.sleep_quality,
    p_sleep_duration: input.sleep_duration,
    p_energy_level: input.energy_level,
    p_stress_level: input.stress_level,
    p_water_cups: input.water_cups,
    p_digestion_rating: input.digestion_rating,
    p_pain_discomfort_level: input.pain_discomfort_level,
    p_movement_today: input.movement_today,
    p_new_or_worsening_concern: input.new_or_worsening_concern,
    p_optional_notes: input.optional_notes,
  });

  if (error) return { error: error.message };

  // AI event emission — never allowed to affect the result above, which
  // has already succeeded by this point. Best-effort: fetch recent
  // history (now including the row just written), build real facts from
  // it, and let the dispatcher decide what (if anything) to do. See
  // lib/ai/events.ts and lib/ai/dispatcher.ts.
  try {
    const { data: recent } = await supabase
      .from('daily_checkins_current')
      .select('*')
      .eq('user_id', user.id)
      .order('local_date', { ascending: false })
      .limit(14);

    const recentCheckins = ((recent as DailyCheckin[] | null) ?? []).slice().reverse();
    const latest = recentCheckins[recentCheckins.length - 1];

    if (latest) {
      const facts = buildRuleFacts(recentCheckins, input.local_date);
      await emitAndDispatch(
        supabase,
        {
          eventType: 'member_completed_checkin',
          memberId: user.id,
          source: 'member',
          payload: { checkin: latest, recentCheckins },
        },
        facts
      );

      await recordTimelineEvent(supabase, {
        memberId: user.id,
        eventType: 'checkin_submitted',
        localDate: input.local_date,
        title: 'Submitted a daily check-in',
        sourceFeature: 'daily_checkins',
        sourceRecordId: latest.id,
      });
    }
  } catch (aiError) {
    console.error('AI event emission failed for submitDailyCheckin', aiError);
  }

  // Milestone 1 safety layer — the check-in form's free-text notes and its
  // "new or worsening concern" flag are real member-authored input; run
  // them through the central classifier before anything downstream (a
  // future coach view of this note, a future feed personalization step)
  // could act on them unreviewed. Best-effort, same discipline as the AI
  // event emission above — never allowed to affect the result already
  // returned to the member.
  try {
    if (input.optional_notes || input.new_or_worsening_concern) {
      const evaluation = await evaluateConcern(supabase, {
        memberId: user.id,
        sourceFeature: 'daily_checkin',
        sourceRecordType: 'daily_checkin',
        text: input.optional_notes,
        newOrWorseningConcern: input.new_or_worsening_concern,
      });

      // Milestone 2: a topic-restricting classification becomes an
      // 'active_restrictions' narrative item, so future coaching (and a
      // future coach view of this member's narrative) has honest context
      // without re-deriving it from the raw classification each time.
      if (evaluation) {
        await recordSafetyRestrictionNarrative(
          supabase,
          user.id,
          'member',
          user.id,
          evaluation.classification
        );
      }
    }
  } catch (safetyError) {
    console.error('Safety classification failed for submitDailyCheckin', safetyError);
  }

  // Root Score System — best-effort recalculation, same discipline as the
  // two blocks above: never allowed to affect the result already
  // returned to the member. A completed check-in is exactly the kind of
  // "meaningful update" the Root Score product spec calls out as a
  // recalculation trigger; getOrCalculateRootScore's own once-per-day
  // cache means this is cheap on a normal day and a real recompute only
  // when it's the first qualifying event of the day.
  try {
    await getOrCalculateRootScore(
      supabase,
      user.id,
      { localDate: input.local_date, timezone: input.timezone },
      { forceRecalculate: true }
    );
  } catch (scoringError) {
    console.error('Root Score recalculation failed for submitDailyCheckin', scoringError);
  }

  return {};
}

/**
 * Today's check-in, reading from the daily_checkins_current view (the
 * highest checkin_version row per date), or null if nothing's been
 * submitted yet.
 */
export async function getTodaysCheckin(localDate: string): Promise<DailyCheckin | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('*')
    .eq('user_id', user.id)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error) {
    console.error('getTodaysCheckin failed', error);
    return null;
  }
  return data as DailyCheckin | null;
}

/**
 * Last N days of check-ins, oldest first, for the dashboard trend chart.
 * Reads from daily_checkins_current so an edited day never shows up twice.
 */
export async function getRecentCheckins(days: number): Promise<DailyCheckin[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('*')
    .eq('user_id', user.id)
    .order('local_date', { ascending: false })
    .limit(days);

  if (error) {
    console.error('getRecentCheckins failed', error);
    return [];
  }
  return (data as DailyCheckin[]).reverse(); // oldest first, for left-to-right chart bars
}

// ---- Habits (used by the check-in form's habit checklist, if present) ----

export async function getActiveHabits(): Promise<Habit[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true);

  if (error) {
    console.error('getActiveHabits failed', error);
    return [];
  }
  return data as Habit[];
}

export async function logHabitCompletion(
  habitId: string,
  localDate: string,
  timezone: string,
  completed: boolean
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase
    .from('habit_logs')
    .upsert(
      { habit_id: habitId, user_id: user.id, local_date: localDate, timezone, completed },
      { onConflict: 'habit_id,local_date' }
    );

  if (error) return { error: error.message };
  return {};
}

/**
 * Habit completion state for a single date, keyed by habit_id — used to
 * prefill the check-in page's habit checklist so a revisit shows what's
 * already been logged today instead of resetting to unchecked.
 */
export async function getHabitLogsForDate(localDate: string): Promise<Record<string, boolean>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data, error } = await supabase
    .from('habit_logs')
    .select('habit_id, completed')
    .eq('user_id', user.id)
    .eq('local_date', localDate);

  if (error) {
    console.error('getHabitLogsForDate failed', error);
    return {};
  }
  return Object.fromEntries(data.map((log) => [log.habit_id, log.completed]));
}
