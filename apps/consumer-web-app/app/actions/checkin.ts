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
import { getCachedUser } from '@/lib/supabase/currentUser';
import type { DailyCheckinInput, DailyCheckin, Habit } from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';
import { emitAndDispatch } from '@/lib/ai/events';
import { buildRuleFacts } from '@/lib/ai/rules/facts';
import { evaluateConcern } from '@/lib/safety/service';
import { recordSafetyRestrictionNarrative } from '@/lib/narrative/service';
import { recordTimelineEvent } from '@/lib/timeline/data';
import { getOrCalculateRootScore } from '@/lib/scoring/service';
import { recordMemberEvent } from '@/lib/events/service';
import { trackProductEvent } from '@/lib/analytics/track';
import { resolveAssignedCoach } from '@/lib/safety/data';
import { getTodaysHydrationTotal } from './events';
import { isHydrationTracked } from '@/lib/hydration/data';
import { recomputeMyRecommendations } from './recommendations';
import { recomputeCoachingGrades } from '@/lib/coaching-direction/gradesService';

/**
 * Daily Check-In redesign v2 — "the new/worsening concern control
 * reaches a human being ... show the coach's avatar beside it." First
 * name only (reusing resolveAssignedCoach, the same lookup
 * safety/handoff code already uses), so a member with no assigned coach
 * yet gets a null, not a made-up name.
 */
export async function getMyCoachFirstName(): Promise<string | null> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return null;

  const coachId = await resolveAssignedCoach(supabase, user.id);
  if (!coachId) return null;

  const { data } = await supabase.from('profiles').select('display_name').eq('id', coachId).maybeSingle();
  const displayName = (data as { display_name: string | null } | null)?.display_name;
  return displayName?.split(' ')[0] ?? null;
}

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

/**
 * The single row writer for daily_checkins — both the real submit and the
 * exit-triggered draft save land here.
 *
 * Conditional water tracking (migration 163) is gated here rather than in
 * either caller, because there are two callers and only one of them is the
 * obvious one. Both check-in forms fill water_cups by reading today's live
 * hydration total rather than by asking a question, so without this a
 * member who does not track water would still accumulate a water number on
 * every row she saved.
 *
 * Null, never 0: 0 is a real logged answer meaning "none today," and this
 * member was never asked. Read gating handles the history she already has;
 * this is what stops that history from growing.
 */
async function insertCheckinRow(
  supabase: ReturnType<typeof createClient>,
  input: DailyCheckinInput,
  memberId: string
): Promise<{ id: string | null; error: string | null }> {
  const waterCups = (await isHydrationTracked(supabase, memberId)) ? input.water_cups : null;

  const { data: newCheckinId, error } = await supabase.rpc('submit_daily_checkin', {
    p_timezone: input.timezone,
    p_local_date: input.local_date,
    p_mood_level: input.mood_level,
    p_sleep_quality: input.sleep_quality,
    p_sleep_duration: input.sleep_duration,
    p_energy_level: input.energy_level,
    p_stress_level: input.stress_level,
    p_water_cups: waterCups,
    p_digestion_rating: input.digestion_rating,
    p_pain_discomfort_level: input.pain_discomfort_level,
    p_movement_today: input.movement_today,
    p_new_or_worsening_concern: input.new_or_worsening_concern,
    p_optional_notes: input.optional_notes,
    p_actual_bedtime: input.actual_bedtime,
    p_actual_wake_time: input.actual_wake_time,
    p_night_waking_count: input.night_waking_count,
    p_night_sweats: input.night_sweats,
    p_morning_soreness: input.morning_soreness,
    p_bowel_movement_status: input.bowel_movement_status,
    p_completion_seconds: input.completion_seconds,
  });

  if (error) return { id: null, error: error.message };
  return { id: newCheckinId as string, error: null };
}

export async function submitDailyCheckin(input: DailyCheckinInput): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();

  if (!user) return { error: 'Not signed in.' };

  const { id: newCheckinId, error } = await insertCheckinRow(supabase, input, user.id);

  if (error) return { error };

  // Member Wellness Event Stream — a completed Morning Readiness check-in
  // is one of the five standardized events every check-in-adjacent
  // feature publishes (see lib/events/service.ts). Best-effort, same
  // discipline as every other side-effect block below: never allowed to
  // affect the result already returned to the member.
  try {
    await recordMemberEvent(supabase, {
      memberId: user.id,
      eventType: 'morning_readiness_recorded',
      timezone: input.timezone,
      payload: { checkinId: newCheckinId as string },
      sourceRecordId: newCheckinId as string,
    });
  } catch (eventError) {
    console.error('Member event recording failed for submitDailyCheckin', eventError);
  }

  // Product analytics, the completion half of the started/completed pair
  // that makes Daily Reset abandonment measurable (the started half fires
  // from the wizard's own mount, components/analytics/TrackSurfaceView.tsx).
  // Deliberately a separate, behavioral-only event rather than reusing
  // morning_readiness_recorded above: that one is a wellness-stream record
  // pointing at a real check-in row, this one carries no answer content at
  // all and is what an analytics query reads. trackProductEvent never
  // throws, so this cannot affect the result already returned.
  await trackProductEvent(supabase, {
    memberId: user.id,
    eventType: 'daily_reset_completed',
    timezone: input.timezone,
  });

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

  // Recommendation Engine — a completed check-in is one of the events that
  // materially changes what it would recommend, so refresh the stored
  // result now rather than leaving it to the next page read to discover
  // it's stale. recomputeMyRecommendations already swallows its own
  // errors, same best-effort discipline as the Root Score call above.
  await recomputeMyRecommendations(supabase, user.id, input.local_date, 'check_in');

  // Adaptive Coaching Direction Part 3 — regrade what the outcome ledger
  // now shows. Same best-effort discipline as the two blocks above, and
  // deliberately triggered here rather than by a cron: a completed check-in
  // is both the moment the ledger's own inputs change and the moment a
  // before/after comparison window is most likely to have just finished
  // elapsing. recomputeCoachingGrades never throws, and does nothing at all
  // when migration 152 has not been applied.
  await recomputeCoachingGrades(supabase, user.id, input.local_date, input.timezone);

  return {};
}

/**
 * Navigation fix (task requirement 1): "exiting mid-check-in saves
 * progress and resumes on return. Never discard answers." Writes a real
 * versioned row via the exact same RPC submitDailyCheckin uses (whatever
 * fields are filled so far, null for the rest — the RPC already allows
 * this, only new_or_worsening_concern is non-nullable at the database
 * level), but deliberately skips every "this check-in genuinely
 * happened" side effect that function fires: no
 * morning_readiness_recorded event, no AI event/facts dispatch, no Root
 * Score recalculation. An exit is not a completion, and firing those
 * would tell the rest of the app (streaks, coaching dispatch, Root Score)
 * that today's check-in finished when it didn't. Safety screening is the
 * one exception kept — a concerning note typed before exiting is still
 * screened, since that discipline is never skipped anywhere else in this
 * app either. completion_seconds is always null on a draft; only a real
 * final submission is timed.
 */
export async function saveDailyCheckinDraft(
  input: Omit<DailyCheckinInput, 'completion_seconds'>
): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await insertCheckinRow(
    supabase,
    { ...input, completion_seconds: null },
    user.id
  );
  if (error) return { error };

  try {
    if (input.optional_notes || input.new_or_worsening_concern) {
      await evaluateConcern(supabase, {
        memberId: user.id,
        sourceFeature: 'daily_checkin',
        sourceRecordType: 'daily_checkin',
        text: input.optional_notes,
        newOrWorseningConcern: input.new_or_worsening_concern,
      });
    }
  } catch (safetyError) {
    console.error('Safety classification failed for saveDailyCheckinDraft', safetyError);
  }

  return {};
}

/**
 * Movement leaves the check-in entirely (task requirement 4) — it's now a
 * quick tap on the Today screen (components/checkin/MovementLevelTracker.tsx),
 * loggable any time, not asked in either check-in form. digestion_rating
 * moved the other direction (folded back into the morning rotation pool,
 * migration 113) so this function no longer sets it directly; callers
 * always pass the member's own existing value through unchanged so a
 * movement tap can never clobber an already-answered digestion question.
 * movement_today still lives on the same daily_checkins row Morning
 * Readiness writes to (unchanged schema, unchanged scoring:
 * lib/wellness/wellness-index.ts and the coaching-insights sources that
 * read it are untouched), so this fetches today's existing row (if
 * Morning Readiness was already submitted) and resubmits it through the
 * exact same submitDailyCheckin path with only movement_today overridden
 * — every other field, and every side effect (events, AI facts, Root
 * Score), stays identical to a normal check-in save. If Morning Readiness
 * was never submitted today, this still creates a valid row: only
 * new_or_worsening_concern is required at the database level, everything
 * else the member never got to (mood, sleep, and so on) is simply null,
 * same as any partially answered day. water_cups is re-read live on every
 * call (never a stale carried-over number), which is also what makes a
 * Today water tap survive an in-between check-in submission unclobbered
 * (requirement 4's "must not be overwritten").
 */
export async function submitEveningBodyCheckin(
  localDate: string,
  timezone: string,
  movementToday: DailyCheckinInput['movement_today'],
  digestionRating: number | null
): Promise<ActionResult> {
  const existing = await getTodaysCheckin(localDate);

  const input: DailyCheckinInput = {
    timezone,
    local_date: localDate,
    mood_level: existing?.mood_level ?? null,
    sleep_quality: existing?.sleep_quality ?? null,
    sleep_duration: existing?.sleep_duration ?? null,
    energy_level: existing?.energy_level ?? null,
    stress_level: existing?.stress_level ?? null,
    water_cups: await getTodaysHydrationTotal(),
    digestion_rating: digestionRating,
    pain_discomfort_level: existing?.pain_discomfort_level ?? null,
    movement_today: movementToday,
    new_or_worsening_concern: existing?.new_or_worsening_concern ?? false,
    optional_notes: existing?.optional_notes ?? null,
    actual_bedtime: existing?.actual_bedtime ?? null,
    actual_wake_time: existing?.actual_wake_time ?? null,
    night_waking_count: existing?.night_waking_count ?? null,
    night_sweats: existing?.night_sweats ?? null,
    morning_soreness: existing?.morning_soreness ?? null,
    bowel_movement_status: existing?.bowel_movement_status ?? null,
    completion_seconds: existing?.completion_seconds ?? null,
  };

  return submitDailyCheckin(input);
}

/**
 * Today's check-in, reading from the daily_checkins_current view (the
 * highest checkin_version row per date), or null if nothing's been
 * submitted yet.
 */
export async function getTodaysCheckin(localDate: string): Promise<DailyCheckin | null> {
  const supabase = createClient();
  const user = await getCachedUser();
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
  const user = await getCachedUser();
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

/**
 * Today page redesign — cumulative, all-time totals for the Accomplished
 * zone. These must never decrease and are never shown as a fraction, so a
 * plain row count (not a windowed read like getRecentCheckins) is exactly
 * what's needed. daily_checkins_current already dedupes to one row per
 * local_date per user (see its view definition), so "total check-ins" and
 * "total days logged" are the same number in this schema — reported as a
 * single "check-ins logged" total rather than two identical-looking stats.
 */
export async function getTotalCheckinCount(): Promise<number> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from('daily_checkins_current')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (error) {
    console.error('getTotalCheckinCount failed', error);
    return 0;
  }
  return count ?? 0;
}

/**
 * Days movement was logged, all-time — reuses the same movement_today
 * column the Today page's own MovementLevelTracker already writes to
 * (rather than the separate member_wellness_events movement_logged event
 * stream, which is a different, unrelated movement-logging feature not
 * connected to this tracker — counting that one here would show a number
 * that doesn't match what logging on this page actually does).
 */
export async function getTotalMovementLoggedDaysCount(): Promise<number> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from('daily_checkins_current')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .not('movement_today', 'is', null);

  if (error) {
    console.error('getTotalMovementLoggedDaysCount failed', error);
    return 0;
  }
  return count ?? 0;
}

// ---- Habits (used by the check-in form's habit checklist, if present) ----

export async function getActiveHabits(): Promise<Habit[]> {
  const supabase = createClient();
  const user = await getCachedUser();
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
  const user = await getCachedUser();
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
  const user = await getCachedUser();
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

