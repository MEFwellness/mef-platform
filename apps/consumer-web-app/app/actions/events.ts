/**
 * apps/consumer-web-app/app/actions/events.ts
 *
 * Server actions for the live, throughout-the-day side of the Member
 * Wellness Event Stream: hydration (running total), movement (logged as
 * it happens), and mid-day concern flagging. Every write here goes through
 * lib/events/service.ts's recordMemberEvent — the one place that inserts
 * into member_wellness_events — so a member never ends up with a second,
 * disconnected hydration/movement/concern system.
 *
 * Auth-guards every call the same way app/actions/checkin.ts does: resolve
 * the signed-in member, read their stored profile timezone (never a
 * client-supplied one), and use that timezone for every occurred_at/
 * local_date computation, same source of truth the check-in flow already
 * uses.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemberWellnessEvent } from '@mef/shared-types-contracts';
import { recordMemberEvent, sumHydrationForDate, listMemberEventsForDate } from '@/lib/events/service';
import { evaluateConcern } from '@/lib/safety/service';
import { nowInTimezone, todaysLocalDate } from '@/lib/time/localDate';
import type { ActionResult } from './auth';

async function requireMemberContext(
  supabase: SupabaseClient
): Promise<{ memberId: string; timezone: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();

  return { memberId: user.id, timezone: profile?.timezone ?? 'America/New_York' };
}

// ---- Hydration: a live running counter, not a once-a-day field ----

/** The member's live hydration total for today — always the sum of today's real logged events, never a fabricated or carried-over number. */
export async function getTodaysHydrationTotal(): Promise<number> {
  const supabase = createClient();
  const ctx = await requireMemberContext(supabase);
  if (!ctx) return 0;

  const localDate = todaysLocalDate(ctx.timezone);
  return sumHydrationForDate(supabase, ctx.memberId, localDate);
}

/**
 * Applies one tap of the existing plus/minus control. Reads the current
 * live total, clamps the result at 0, and writes only the actual delta
 * (so tapping minus at 0 is a no-op, not a -1 event) into the event
 * stream — this single write is both "update the live hydration total"
 * and "update the standardized event stream," by construction, since the
 * total is always derived from the stream itself.
 */
export async function logHydrationChange(
  delta: 1 | -1
): Promise<{ total: number; error?: undefined } | { error: string; total?: undefined }> {
  const supabase = createClient();
  const ctx = await requireMemberContext(supabase);
  if (!ctx) return { error: 'Not signed in.' };

  const localDate = todaysLocalDate(ctx.timezone);
  const current = await sumHydrationForDate(supabase, ctx.memberId, localDate);
  const next = Math.max(0, current + delta);
  const actualDelta = next - current;

  if (actualDelta === 0) return { total: current };

  const event = await recordMemberEvent(supabase, {
    memberId: ctx.memberId,
    eventType: 'hydration_logged',
    timezone: ctx.timezone,
    payload: { delta: actualDelta, totalAfter: next },
  });

  if (!event) return { error: 'Failed to log hydration. Please try again.' };
  return { total: next };
}

// ---- Movement: logged when it happens, not reconstructed from memory ----

export type MovementType = 'walk' | 'stretch' | 'workout' | 'other';

/**
 * `minutesAgo` lets a member log movement that already happened (e.g. "log
 * this walk as 30 minutes ago") instead of only being able to log the
 * present moment — occurred_at is backdated accordingly, so a late-entered
 * event still files at the time it actually happened, never at write time.
 */
export async function logMovementEvent(
  movementType: MovementType,
  note: string | null,
  minutesAgo = 0
): Promise<ActionResult> {
  const supabase = createClient();
  const ctx = await requireMemberContext(supabase);
  if (!ctx) return { error: 'Not signed in.' };

  const occurredAt = new Date(nowInTimezone(ctx.timezone).getTime() - Math.max(0, minutesAgo) * 60_000);

  const event = await recordMemberEvent(supabase, {
    memberId: ctx.memberId,
    eventType: 'movement_logged',
    timezone: ctx.timezone,
    occurredAt,
    payload: { movementType, note: note?.trim() ? note.trim() : null },
  });

  if (!event) return { error: 'Failed to log movement. Please try again.' };
  return {};
}

/** Today's logged movement events, oldest-first by occurred_at — for the live "what you've logged today" list. */
export async function getTodaysMovementEvents(): Promise<MemberWellnessEvent[]> {
  const supabase = createClient();
  const ctx = await requireMemberContext(supabase);
  if (!ctx) return [];

  const localDate = todaysLocalDate(ctx.timezone);
  const events = await listMemberEventsForDate(supabase, ctx.memberId, localDate);
  return events.filter((e) => e.event_type === 'movement_logged');
}

// ---- Mid-day concern flagging ----

/**
 * Lets a member report a new or worsening concern the moment it comes up,
 * rather than only at the next full check-in. Writes the event, then
 * routes through the exact same evaluateConcern() safety pipeline every
 * other concern-reporting surface in this app already uses — a mid-day
 * flag is never a second, unreviewed channel.
 */
export async function flagConcern(text: string): Promise<ActionResult> {
  const supabase = createClient();
  const ctx = await requireMemberContext(supabase);
  if (!ctx) return { error: 'Not signed in.' };

  const trimmed = text.trim();
  if (!trimmed) return { error: 'Please describe the concern before submitting.' };

  const event = await recordMemberEvent(supabase, {
    memberId: ctx.memberId,
    eventType: 'concern_flagged',
    timezone: ctx.timezone,
    payload: { text: trimmed },
  });

  if (!event) return { error: 'Failed to save your concern. Please try again.' };

  try {
    await evaluateConcern(supabase, {
      memberId: ctx.memberId,
      sourceFeature: 'member_wellness_event',
      sourceRecordType: 'member_wellness_events',
      sourceRecordId: event.id,
      sourceEventId: event.id,
      text: trimmed,
      newOrWorseningConcern: true,
    });
  } catch (safetyError) {
    console.error('Safety classification failed for flagConcern', safetyError);
  }

  return {};
}
