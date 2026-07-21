/**
 * apps/consumer-web-app/app/actions/eveningReflection.ts
 *
 * Evening Reflection — short, always-available, never required for
 * Morning Readiness. Deliberately its own table (evening_reflections,
 * migration 63) and its own submission path, not a same-row extension of
 * daily_checkins: a member must be able to complete either one without
 * the other ever existing. One row per member per local_date, upserted in
 * place (no version history — see the migration's own note on why this
 * differs from daily_checkins' append-only-version convention).
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import type { EnergyPattern, EveningReflection } from '@mef/shared-types-contracts';
import { recordMemberEvent } from '@/lib/events/service';
import { recordTimelineEvent } from '@/lib/timeline/data';
import { evaluateConcern } from '@/lib/safety/service';
import { todaysLocalDate } from '@/lib/time/localDate';
import type { ActionResult } from './auth';

export type EveningReflectionFormInput = {
  overallDayRating: number | null;
  daytimeStress: number | null;
  energyPattern: EnergyPattern | null;
  symptomsOrChanges: string | null;
  recovery: number | null;
};

async function requireMemberTimezone(
  supabase: ReturnType<typeof createClient>,
  timezoneOverride?: string
): Promise<{ memberId: string; timezone: string } | null> {
  const user = await getCachedUser();
  if (!user) return null;

  if (timezoneOverride) {
    return { memberId: user.id, timezone: timezoneOverride };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();

  return { memberId: user.id, timezone: profile?.timezone ?? 'America/New_York' };
}

/**
 * Today's Evening Reflection, or null if it hasn't been submitted yet,
 * powers "resume where you left off" the same way getTodaysCheckin does
 * for the morning flow. `timezone` is an optional caller-supplied value
 * (e.g. the Dashboard already fetched its own profile row), passing it
 * skips this function's own redundant profiles query for the exact same
 * row; omit it and behavior is unchanged from before.
 */
export async function getTodaysEveningReflection(
  timezone?: string
): Promise<EveningReflection | null> {
  const supabase = createClient();
  const ctx = await requireMemberTimezone(supabase, timezone);
  if (!ctx) return null;

  const localDate = todaysLocalDate(ctx.timezone);
  const { data, error } = await supabase
    .from('evening_reflections')
    .select('*')
    .eq('member_id', ctx.memberId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error) {
    console.error('getTodaysEveningReflection failed', error);
    return null;
  }
  return data as EveningReflection | null;
}

/**
 * Available at any time of day — no hour lock, no gate. Upserts on
 * (member_id, local_date) so re-opening and re-saving the same day's
 * reflection updates it in place rather than creating a duplicate.
 */
export async function submitEveningReflection(
  input: EveningReflectionFormInput
): Promise<ActionResult> {
  const supabase = createClient();
  const ctx = await requireMemberTimezone(supabase);
  if (!ctx) return { error: 'Not signed in.' };

  const localDate = todaysLocalDate(ctx.timezone);

  const { data: saved, error } = await supabase
    .from('evening_reflections')
    .upsert(
      {
        member_id: ctx.memberId,
        timezone: ctx.timezone,
        local_date: localDate,
        overall_day_rating: input.overallDayRating,
        daytime_stress: input.daytimeStress,
        energy_pattern: input.energyPattern,
        symptoms_or_changes: input.symptomsOrChanges?.trim()
          ? input.symptomsOrChanges.trim()
          : null,
        recovery: input.recovery,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'member_id,local_date' }
    )
    .select('*')
    .single();

  if (error || !saved)
    return { error: error?.message ?? 'Failed to save your Evening Reflection.' };

  const reflection = saved as EveningReflection;

  try {
    await recordMemberEvent(supabase, {
      memberId: ctx.memberId,
      eventType: 'evening_reflection_recorded',
      timezone: ctx.timezone,
      payload: { reflectionId: reflection.id },
      sourceRecordId: reflection.id,
    });

    await recordTimelineEvent(supabase, {
      memberId: ctx.memberId,
      eventType: 'evening_reflection_submitted',
      localDate,
      title: 'Completed an Evening Reflection',
      sourceFeature: 'evening_reflections',
      sourceRecordId: reflection.id,
    });
  } catch (eventError) {
    console.error('Member event recording failed for submitEveningReflection', eventError);
  }

  // Same safety discipline every other member-authored free-text field in
  // this app already follows — symptoms_or_changes is real member input.
  try {
    if (input.symptomsOrChanges?.trim()) {
      await evaluateConcern(supabase, {
        memberId: ctx.memberId,
        sourceFeature: 'member_wellness_event',
        sourceRecordType: 'evening_reflections',
        sourceRecordId: reflection.id,
        text: input.symptomsOrChanges,
      });
    }
  } catch (safetyError) {
    console.error('Safety classification failed for submitEveningReflection', safetyError);
  }

  return {};
}
