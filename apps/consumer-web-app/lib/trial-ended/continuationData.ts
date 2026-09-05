/**
 * DAY 8 AND AFTER: everything the continuation screen reads, and it is
 * almost nothing.
 *
 * THIS MODULE ONLY READS. It has no insert, no upsert, no update and no
 * delete, and it never will: this screen is reached by a redirect from the
 * middleware, so a render-time write here would fire for every locked
 * account on every page it tried to open. There is no decision on this
 * screen for a render to make.
 *
 * THE THREE STATES THAT HAVE A WEEK COST TWO ROWS. Her stored close
 * (migration 206) and her stored recap (migration 205), each read through
 * the module that owns it, each already proven to reach no gate. Nothing is
 * recomputed, nothing is re-scored and no membership tier, entitlement or
 * assessment registry is consulted, which is exactly the property days 6
 * and 7 were built to hand this screen.
 *
 * THE NO-ARC STATE IS THE ONE THAT COUNTS ANYTHING, and it counts only
 * things that are plainly true: how many days inside her own free week hold
 * a Daily Reset, and how many of the three free conversations she finished.
 * Both come from rows, through helpers that already exist. Neither asks
 * whether anything is OPEN to her, which is the registry question this
 * screen must never ask: it asks only what she already did.
 *
 * IT IS ALSO THE ONLY STATE THAT COSTS THOSE READS. An account with a
 * stored recap or close never runs them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUnifiedAssessmentDefinitionByKey } from '../assessment-foundation/repository';
import { findLatestCompletedSession } from '../assessment-runtime';
import { CVS_KEY } from '../core-values-snapshot/constants';
import { LSC_KEY } from '../life-signal-check/constants';
import { RPL_KEY } from '../readiness-pulse/constants';
import { trialLengthDaysOf } from '../membership/access';
import { localDateStringFor } from '../time/localDate';
import { getTrialArcClose } from '../trial-arc/closeData';
import { getTrialArcRecap } from '../trial-arc/recapData';
import { listTrialArcCheckinDates } from '../trial-arc/data';
import type { MemberSubscription } from '../membership/types';
import type { TrialEndedContinuationState, TrialEndedCounts } from './continuationTypes';

/**
 * Which state she is in, decided from the rows that exist and from nothing
 * else. Pure and synchronous, so every branch is testable with no database.
 *
 * THE ORDER IS THE DESIGN. A stored close outranks a stored recap, because
 * the close is the later and more complete statement about her week and it
 * carries the outcome this screen exists to preserve. Whether she OPENED it
 * decides only which of the two close states she gets, never whether the
 * outcome is shown: she never loses what she generated, and being busy on
 * day 7 is not a reason to lose it.
 */
export function decideTrialEndedState(input: {
  close: { plan: import('../trial-arc/closeTypes').TrialArcClosePlan; openedAt: string | null } | null;
  hasRecap: boolean;
  counts: TrialEndedCounts;
}): TrialEndedContinuationState {
  if (input.close) {
    return {
      kind: input.close.openedAt ? 'full' : 'close_unopened',
      close: input.close.plan,
      hasRecap: input.hasRecap,
    };
  }
  if (input.hasRecap) return { kind: 'recap_only' };
  return { kind: 'no_arc', counts: input.counts };
}

/** Nothing counted, for a state that does not count and for a read that could not. */
export const NO_TRIAL_ENDED_COUNTS: TrialEndedCounts = {
  checkinDays: 0,
  conversations: 0,
  trialLengthDays: null,
};

/**
 * Her own free week's counts.
 *
 * THE WINDOW IS HER OWN STORED ONE, never today's trial length and never a
 * window this module invents. An account stamped before migration 198 was
 * given 30 days and is counted over 30; an account stamped after it is
 * counted over 7. Both ends are converted to her own calendar day in her
 * own timezone before anything is compared, because a day boundary used as
 * data is never allowed to come from a server clock.
 */
export async function readTrialEndedCounts(
  supabase: SupabaseClient,
  memberId: string,
  input: { subscription: MemberSubscription | null; timeZone: string }
): Promise<TrialEndedCounts> {
  const { subscription, timeZone } = input;
  if (!subscription) return NO_TRIAL_ENDED_COUNTS;

  const startLocalDate = localDateStringFor(subscription.trialStartedAt, timeZone);
  const endLocalDate = localDateStringFor(subscription.trialEndsAt, timeZone);
  if (!startLocalDate || !endLocalDate) return NO_TRIAL_ENDED_COUNTS;

  const [checkinDates, conversations] = await Promise.all([
    listTrialArcCheckinDates(supabase, memberId, startLocalDate, endLocalDate),
    countFinishedConversations(supabase, memberId),
  ]);

  return {
    checkinDays: new Set(checkinDates).size,
    conversations,
    trialLengthDays: trialLengthDaysOf(subscription.trialStartedAt, subscription.trialEndsAt),
  };
}

/**
 * How many of the three free conversations are genuinely finished.
 *
 * THE SAME THREE KEYS DAY 7'S COMPOSER USES, and the same accessor, so this
 * number and the one on a stored close can never be two different counts of
 * the same thing. A completed session is the only thing that counts; a
 * draft is not a completion, which is the rule the whole app already keeps.
 */
async function countFinishedConversations(
  supabase: SupabaseClient,
  memberId: string
): Promise<number> {
  const results = await Promise.all(
    [CVS_KEY, LSC_KEY, RPL_KEY].map(async (key) => {
      const definition = await getUnifiedAssessmentDefinitionByKey(supabase, key);
      if (!definition) return false;
      return (await findLatestCompletedSession(supabase, memberId, definition.id)) !== null;
    })
  );
  return results.filter(Boolean).length;
}

/**
 * The whole state for one member, in as few reads as the question allows.
 *
 * The close and the recap are read together. The counts are read only when
 * neither exists, because they are the no-arc state's and no other state
 * renders them.
 */
export async function resolveTrialEndedState(
  supabase: SupabaseClient,
  memberId: string,
  input: { subscription: MemberSubscription | null; timeZone: string }
): Promise<TrialEndedContinuationState> {
  const [close, recap] = await Promise.all([
    getTrialArcClose(supabase, memberId),
    getTrialArcRecap(supabase, memberId),
  ]);

  if (close || recap) {
    return decideTrialEndedState({
      close: close ? { plan: close.plan, openedAt: close.openedAt } : null,
      hasRecap: recap !== null,
      counts: NO_TRIAL_ENDED_COUNTS,
    });
  }

  const counts = await readTrialEndedCounts(supabase, memberId, input);
  return decideTrialEndedState({ close: null, hasRecap: false, counts });
}
