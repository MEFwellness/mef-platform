/**
 * Has she opened this program yet?
 *
 * One fact, one event type, one file that reads and writes it (migration
 * 185) — same "one file talks to this table" discipline as
 * lib/events/service.ts's other callers.
 *
 * A program is delivered as one assignment per weekly session (migration
 * 172), so "opened" is a property of the GROUP, not of the session she
 * happened to tap. Opening Session B marks the program opened, and the
 * mark never comes back. The event carries the assignment she opened it
 * from on source_record_id, so the question is a lookup over that group's
 * own assignment ids.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordMemberEvent } from '../events/service';

/**
 * True when NONE of this program's assignments has ever been opened.
 *
 * Fails closed to false. If the read errors, the honest answer is "do not
 * put a New mark on it", because a mark shown wrongly is a small lie told
 * to a member and a mark missed is only a missed flourish.
 */
export async function isProgramUnopened(
  supabase: SupabaseClient,
  assignmentIds: string[]
): Promise<boolean> {
  if (assignmentIds.length === 0) return false;

  const { data, error } = await supabase
    .from('member_wellness_events')
    .select('id')
    .eq('event_type', 'program_opened')
    .in('source_record_id', assignmentIds)
    .limit(1);

  if (error) {
    console.error('isProgramUnopened failed', error);
    return false;
  }
  return (data ?? []).length === 0;
}

/**
 * Records the first open of a program, and only the first. A second call
 * for the same program group writes nothing, so the event stream carries
 * one row per program rather than one per visit: this is a durable mark,
 * not a page-view counter.
 *
 * Never throws. Opening a program must not fail because an event row did
 * not write, and the screen she asked for has already rendered by the time
 * this runs.
 */
export async function recordProgramOpened(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    /** Every assignment in the program group, so a second session cannot record a second open. */
    assignmentIds: string[];
    /** The one she actually opened it from. Goes on source_record_id. */
    openedAssignmentId: string;
    timezone: string;
  }
): Promise<boolean> {
  try {
    if (!(await isProgramUnopened(supabase, input.assignmentIds))) return false;

    const event = await recordMemberEvent(supabase, {
      memberId: input.memberId,
      eventType: 'program_opened',
      timezone: input.timezone,
      sourceRecordId: input.openedAssignmentId,
    });
    return event !== null;
  } catch (err) {
    console.error('recordProgramOpened failed', err);
    return false;
  }
}
