/**
 * WHICH DAY OF HER TRIAL IS IT.
 *
 * COUNTED FROM trial_started_at, NEVER FROM trial_ends_at. Those are two
 * different facts and only one of them is a beginning. The trial length
 * changed once already (migration 198 cut it from 30 days to 7), and
 * grandfathering worked precisely because trial_started_at and
 * trial_ends_at are both stamped rather than derived from each other. A day
 * number counted backwards from the end would have moved every existing
 * member's day 1 on the morning that migration ran.
 *
 * IN HER OWN TIMEZONE. The day number decides which message she gets, so it
 * is a day boundary used as data, not a display string: it comes from her
 * stored profile timezone through lib/time/memberToday.ts, on the server,
 * and never from `new Date()` on a server that runs in UTC. Somebody who
 * signed up at 8pm in New York is on day 1 for the rest of that evening,
 * not on day 2 because UTC has already rolled over.
 *
 * SIGNUP DAY IS DAY 1. Not day 0. The first message she can receive is the
 * one written for the day she arrived.
 *
 * THE CLOCK NEVER RESETS AND NEVER EXTENDS. There is no branch in this file
 * that adjusts, pauses, restarts or forgives the count, and nothing else in
 * the arc computes a day number of its own. A member who does not open the
 * app until her fourth day is on day 4, and reads the message written for
 * day 4.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { daysBetweenLocalDates } from '../feed/dateMath';
import { localDateStringFor } from '../time/localDate';
import { memberTimezone } from '../time/memberToday';
import { fetchMemberAccessFacts } from '../membership/service';

export interface TrialDayInput {
  /** member_subscriptions.trial_started_at, or null when the account has no membership row at all. */
  trialStartedAt: string | null;
  /** Her own timezone, already resolved on the server. */
  timeZone: string;
  /** The instant the question is being asked at. Passed in, never read from the clock here, so a server render and a test agree. */
  now: Date;
}

/**
 * The day number, or null when there is no trial to count from.
 *
 * Null, deliberately, in three shapes that are not the same as day 0: no
 * membership row, an unparseable start, and a start in her own future. The
 * arc says nothing on a null rather than guessing at a day, which is the
 * same direction eligibility takes and for the same reason.
 *
 * Days past the end of the week keep counting (day 9 is day 9). Nothing
 * here clamps: the callers decide what they have a message for, and a
 * clamp would quietly turn a lapsed account into somebody on day 7.
 */
export function dayNumberFor(input: TrialDayInput): number | null {
  const { trialStartedAt, timeZone, now } = input;
  if (!trialStartedAt) return null;

  const started = new Date(trialStartedAt);
  if (Number.isNaN(started.getTime())) return null;

  const startLocalDate = localDateStringFor(trialStartedAt, timeZone);
  // localDateStringFor, not todaysLocalDate: the same conversion for an
  // arbitrary instant rather than for whatever the process clock says right
  // now. `now` is passed in by every caller, which is what makes this
  // testable without moving a machine's clock.
  const todayLocalDate = localDateStringFor(now.toISOString(), timeZone);

  const elapsed = daysBetweenLocalDates(startLocalDate, todayLocalDate);
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;

  return elapsed + 1;
}

export interface TrialDay {
  dayNumber: number;
  /** Her own calendar day, YYYY-MM-DD. Handed on to everything downstream so the day boundary is resolved once per visit. */
  todayLocalDate: string;
  /** Her own calendar day that the trial began on. */
  startLocalDate: string;
  timeZone: string;
}

/**
 * The same answer for one account, reading her timezone and her
 * subscription row first.
 *
 * Reuses fetchMemberAccessFacts, the one accessor that already reads
 * member_access_facts, rather than issuing its own query against
 * member_subscriptions: the trial lock and the arc can then never be
 * looking at different rows about the same trial.
 */
export async function resolveTrialDay(
  supabase: SupabaseClient,
  memberId: string,
  now: Date = new Date()
): Promise<TrialDay | null> {
  const [timeZone, facts] = await Promise.all([
    memberTimezone(supabase, memberId),
    fetchMemberAccessFacts(supabase, memberId),
  ]);

  const trialStartedAt = facts.subscription?.trialStartedAt ?? null;
  const dayNumber = dayNumberFor({ trialStartedAt, timeZone, now });
  if (dayNumber === null || trialStartedAt === null) return null;

  return {
    dayNumber,
    todayLocalDate: localDateStringFor(now.toISOString(), timeZone),
    startLocalDate: localDateStringFor(trialStartedAt, timeZone),
    timeZone,
  };
}
