/**
 * Member Wellness Event Stream — persistence. The single write path into
 * member_wellness_events (migration 63), which every check-in-adjacent
 * feature (Morning Readiness, live hydration, live movement, mid-day
 * concern flagging, Evening Reflection) publishes through, so there is
 * exactly one standardized event shape and one place that knows how to
 * write it — same "one file talks to this table" discipline as
 * lib/timeline/data.ts and lib/scoring/fetchInputs.ts.
 *
 * occurred_at vs. recorded_at: occurred_at defaults to "now, in the
 * member's own timezone" but a caller may pass an explicit occurredAt to
 * backdate an event to when it actually happened. local_date is always
 * derived from occurred_at, never from server "now" — a backdated event
 * files under the day it actually happened, even once that's no longer
 * today. Every reader in this codebase must order/filter by occurred_at;
 * recorded_at (server write time) exists only as an audit fact.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MemberWellnessEvent,
  MemberWellnessEventPayload,
  MemberWellnessEventSource,
  MemberWellnessEventType,
} from '@mef/shared-types-contracts';
import { nowInTimezone, toLocalDateString } from '../time/localDate';

export type RecordMemberEventInput = {
  memberId: string;
  eventType: MemberWellnessEventType;
  timezone: string;
  payload?: MemberWellnessEventPayload;
  /** When the event actually happened. Defaults to now-in-timezone — pass this to backdate (e.g. "log this walk as 30 minutes ago"). */
  occurredAt?: Date;
  sourceRecordId?: string | null;
  source?: MemberWellnessEventSource;
};

export async function recordMemberEvent(
  supabase: SupabaseClient,
  input: RecordMemberEventInput
): Promise<MemberWellnessEvent | null> {
  const occurredAt = input.occurredAt ?? nowInTimezone(input.timezone);
  const localDate = toLocalDateString(occurredAt);

  const { data, error } = await supabase
    .from('member_wellness_events')
    .insert({
      member_id: input.memberId,
      event_type: input.eventType,
      occurred_at: occurredAt.toISOString(),
      timezone: input.timezone,
      local_date: localDate,
      payload: input.payload ?? {},
      source: input.source ?? 'member',
      source_record_id: input.sourceRecordId ?? null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('recordMemberEvent failed', error);
    return null;
  }
  return data as MemberWellnessEvent;
}

/** One member's events for one local_date, oldest-first by occurred_at — the only column any ordering may use (see module header). */
export async function listMemberEventsForDate(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<MemberWellnessEvent[]> {
  const { data, error } = await supabase
    .from('member_wellness_events')
    .select('*')
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .order('occurred_at', { ascending: true });

  if (error) {
    console.error('listMemberEventsForDate failed', error);
    return [];
  }
  return data as MemberWellnessEvent[];
}

/** Most recent events across all days, newest-first by occurred_at — for a member-facing activity feed. */
export async function listRecentMemberEvents(
  supabase: SupabaseClient,
  memberId: string,
  limit = 50
): Promise<MemberWellnessEvent[]> {
  const { data, error } = await supabase
    .from('member_wellness_events')
    .select('*')
    .eq('member_id', memberId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listRecentMemberEvents failed', error);
    return [];
  }
  return data as MemberWellnessEvent[];
}

/**
 * Today's live hydration total — the sum of every hydration_logged
 * event's delta for local_date, clamped at 0. This is the single source
 * of truth for "how much water has the member logged today." Never
 * fabricated: zero events means zero cups, not null and not a guess.
 */
export async function sumHydrationForDate(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<number> {
  const events = await listMemberEventsForDate(supabase, memberId, localDate);
  const total = events
    .filter((e) => e.event_type === 'hydration_logged')
    .reduce((sum, e) => sum + ((e.payload as { delta?: number }).delta ?? 0), 0);
  return Math.max(0, total);
}
