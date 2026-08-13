/**
 * The movement flip — closing the loop when she actually does the session.
 *
 * ONE RULE, and it is the whole point of this file: a member who does the
 * workout must never also have to tap Done. Root asked her to do a session,
 * she did it, and the card asking her to confirm it would be Root failing to
 * notice the very thing it asked for.
 *
 * WHAT IT IS NOT. Not a second outcome path. It writes through exactly the
 * two functions the card's own Done button writes through
 * (lib/priority/data.ts's setDailyPriorityStatus and ./data.ts's
 * recordCoachingResponse), so the card's status row and the outcome ledger
 * can no more disagree here than they can there.
 *
 * NO DOUBLE COUNT, by three independent mechanisms rather than by a flag:
 *   1. `recordCoachingResponse` only ever matches a row whose
 *      member_response is still null, so the ledger takes the first answer
 *      and every later one is a no-op. That is also what makes the analytics
 *      event exactly one per decision: it is gated on that write landing.
 *   2. The status write is skipped when the row is already 'done', so
 *      done_at records when she first finished rather than the last time she
 *      repeated the session.
 *   3. `completeSessionRun` upstream only claims a run whose completed_at is
 *      still null, so a resubmitted completion never reaches this at all.
 *
 * IT ONLY EVER TOUCHES TODAY'S OWN MOVEMENT DECISION. Two checks, both
 * against the ledger rather than against anything the browser said: today's
 * decision must be typed 'movement', and its recorded session key must be
 * the session she just finished. A member who completes Desk Reset on a day
 * Root offered Hip and Back Reset has done something real, and it is not the
 * thing the card asked for, so nothing is marked done.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { setDailyPriorityStatus, getDailyPriority } from '../priority/data';
import { getCoachingDecision, recordCoachingResponse } from './data';

export type MovementCompletionOutcome =
  /** Today's decision was a movement action for this session, and it is now done. */
  | 'recorded'
  /** It was, and something had already answered for it. Nothing was written. */
  | 'already_answered'
  /** Today's decision was not a movement action for this session. Nothing was written. */
  | 'not_todays_priority';

/**
 * Marks today's priority done because she finished the session it asked
 * for. Returns what happened, so the caller can fire its one analytics
 * event only when a response genuinely landed.
 *
 * Best effort throughout: this runs behind a member who has just finished a
 * workout and is looking at her completion screen, and nothing here is worth
 * an error on that screen.
 */
export async function recordMovementSessionCompletion(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  sessionKey: string
): Promise<MovementCompletionOutcome> {
  try {
    const decision = await getCoachingDecision(supabase, memberId, localDate);
    if (!decision) return 'not_todays_priority';
    if (decision.actionType !== 'movement') return 'not_todays_priority';
    if (decision.signalEvidence.sessionKey !== sessionKey) return 'not_todays_priority';

    // The ledger first, because its conditional write is the one that
    // decides whether this is the first answer of the day.
    const landed = await recordCoachingResponse(supabase, memberId, localDate, 'done');

    // The card's own status, so the next render shows her the accomplished
    // state rather than the three buttons she no longer needs. Written even
    // when the ledger row was already answered (she tapped Help me, then did
    // the session anyway), because the card should still show what she did.
    const record = await getDailyPriority(supabase, memberId, localDate);
    if (record && record.status !== 'done') {
      await setDailyPriorityStatus(supabase, memberId, localDate, 'done');
    }

    return landed ? 'recorded' : 'already_answered';
  } catch (error) {
    console.error('recordMovementSessionCompletion failed', error);
    return 'not_todays_priority';
  }
}
