/**
 * IS THIS ACCOUNT IN THE AUTOMATED TRIAL ARC.
 *
 * Six conditions, all of which must hold. There is no combination of
 * signals that overrules a failing one, no "unless", and no override flag.
 * The order below is the order they are checked, and the FIRST failure is
 * the reason reported, which is why rule 1 comes first: while
 * TRIAL_ARC_LAUNCH is null every account in the system answers
 * 'launch_not_set', and that is the whole switch.
 *
 *   1. The arc is launched, and this account was created on or after the
 *      launch. No backfill: an existing member is excluded by their own
 *      signup date rather than by a list.
 *   2. It is not a seeded test account.
 *   3. It has a member_subscriptions row on tier 'trial' with source
 *      'system'. Source matters: 'system' is the untouched automatic trial
 *      nobody assigned. A trial an administrator put somebody on by hand is
 *      a decision a person made, and the arc does not talk over it.
 *   4. It has NEVER held a coach_client_assignments row, in any status.
 *      Ever having been assigned a coach, even an assignment revoked the
 *      same day, permanently excludes the account. This is the one rule
 *      that reaches into the past on purpose: somebody who has spoken to a
 *      coach must never receive an automated sequence written for a
 *      stranger.
 *   5. Nobody has suppressed the arc for this account (migration 203).
 *   6. The relationship derivation answers PROSPECT.
 *
 * RULES 4 AND 6 ARE NOT THE SAME RULE, and both are here on purpose. Rule 6
 * asks who this account is today. Rule 4 asks whether it has ever been a
 * client. An account whose only assignment was revoked passes 6 and fails
 * 4, which is the intended answer.
 *
 * FAILS SHUT, EVERY TIME. A read that failed, a missing profile, an
 * unparseable date: every one of them returns false with a reason naming
 * what was missing. This is the opposite direction from
 * lib/membership/access.ts, and for the opposite reason. There, a broken
 * lookup must never shut a paying member out of a product they paid for.
 * Here, a broken lookup must never send a stranger's welcome sequence to
 * somebody's coaching client.
 *
 * NOTHING HERE WRITES. Not a row, not a flag, not a timestamp. Eligibility
 * is derived from facts that already exist, every time it is asked, so no
 * render can decide anything by reading it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveRelationship, fetchRelationshipFacts } from '../membership/relationship';
import type { RelationshipFacts, RelationshipType } from '../membership/relationship';
import { TRIAL_ARC_LAUNCH, trialArcLaunchInstant } from './config';

/**
 * Why the answer is what it is. One value per rule, plus the two ways the
 * facts themselves can be unusable. 'eligible' is the only affirmative.
 */
export const TRIAL_ARC_REASONS = [
  'eligible',
  /** Rule 1a: TRIAL_ARC_LAUNCH is null or unparseable, so the arc is launched for no one. */
  'launch_not_set',
  /** Rule 1b: the account existed before the arc did. */
  'account_predates_launch',
  /** Rule 2. */
  'test_account',
  /** Rule 3a: no member_subscriptions row at all. */
  'no_subscription',
  /** Rule 3b: on some tier other than the free trial. */
  'not_on_trial',
  /** Rule 3c: on a trial an administrator assigned by hand, not the automatic one. */
  'trial_not_automatic',
  /** Rule 4: a coach assignment exists or once existed, in any status. */
  'ever_coach_assigned',
  /** Rule 5. */
  'suppressed',
  /** Rule 6. */
  'not_a_prospect',
  /** A read failed, or the account has no readable creation date. Nothing is assumed. */
  'facts_unavailable',
] as const;

export type TrialArcReason = (typeof TRIAL_ARC_REASONS)[number];

export interface TrialArcEligibility {
  eligible: boolean;
  reason: TrialArcReason;
  /** The same answer as a sentence, for a log line and for the administrator's screen later. Never shown to a member. */
  explanation: string;
  /** What the derivation made of this account, carried through so a caller logging a refusal does not have to ask again. */
  relationship: RelationshipType;
}

const EXPLANATION: Record<TrialArcReason, string> = {
  eligible: 'On the automatic free trial, no coach has ever been assigned, and nobody has silenced the arc.',
  launch_not_set: 'The trial arc has no launch date set, so it is launched for no one.',
  account_predates_launch: 'This account was created before the trial arc launched.',
  test_account: 'This is a test account.',
  no_subscription: 'This account has no membership record.',
  not_on_trial: 'This account is not on the free trial.',
  trial_not_automatic: 'This trial was assigned by hand, not stamped automatically at signup.',
  ever_coach_assigned: 'This account has been assigned a coach at some point, so the automated arc never applies to it.',
  suppressed: 'An administrator has suppressed the trial arc for this account.',
  not_a_prospect: 'This account already has a relationship with the practice beyond the trial.',
  facts_unavailable: 'The facts this decision needs could not be read, so the answer is no.',
};

function decision(reason: TrialArcReason, relationship: RelationshipType): TrialArcEligibility {
  return {
    eligible: reason === 'eligible',
    reason,
    explanation: EXPLANATION[reason],
    relationship,
  };
}

export interface TrialArcEligibilityInput {
  facts: RelationshipFacts;
  /** The instant the question is being asked at. Passed in, never read from the clock here, so a caller on a server render and a test agree. */
  now: Date;
  /** Defaults to the shipped constant. Passed explicitly only by tests and by a one-off report. */
  launch?: string | null;
}

/**
 * The decision, over facts already in hand. Pure and synchronous, so the
 * whole rule set is testable without a database.
 */
export function decideTrialArcEligibility(input: TrialArcEligibilityInput): TrialArcEligibility {
  const { facts, now } = input;
  const relationship = deriveRelationship(facts);
  const launch = trialArcLaunchInstant(input.launch === undefined ? TRIAL_ARC_LAUNCH : input.launch);

  // Rule 1. First, and unconditionally first: while there is no launch
  // date there is no arc, and no other fact about the account can change
  // that.
  if (launch === null) return decision('launch_not_set', relationship);

  if (facts.readFailed) return decision('facts_unavailable', relationship);

  if (!facts.accountCreatedAt) return decision('facts_unavailable', relationship);
  const createdAt = new Date(facts.accountCreatedAt);
  if (Number.isNaN(createdAt.getTime())) return decision('facts_unavailable', relationship);
  // "On or after", so an account created in the launch instant itself is in.
  if (createdAt.getTime() < launch.getTime()) {
    return decision('account_predates_launch', relationship);
  }
  // An account that does not exist yet at `now` is not a fact this can act
  // on either. Cheap, and it keeps a clock skew from being a send.
  if (createdAt.getTime() > now.getTime()) return decision('facts_unavailable', relationship);

  // Rule 2.
  if (facts.isTest) return decision('test_account', relationship);

  // Rule 3.
  if (!facts.hasSubscription) return decision('no_subscription', relationship);
  if (facts.tier !== 'trial') return decision('not_on_trial', relationship);
  if (facts.source !== 'system') return decision('trial_not_automatic', relationship);

  // Rule 4. Any row, any status, ever.
  if (facts.everCoachAssigned) return decision('ever_coach_assigned', relationship);

  // Rule 5. Read only to say no. There is no branch anywhere in this file
  // where this column turns anything on.
  if (facts.trialArcSuppressedAt !== null) return decision('suppressed', relationship);

  // Rule 6.
  if (relationship !== 'PROSPECT') return decision('not_a_prospect', relationship);

  return decision('eligible', relationship);
}

/**
 * The same decision for one account, reading the facts first. Reuses
 * lib/membership/relationship.ts's reads rather than issuing its own, so
 * the arc and the derivation can never be looking at different rows.
 */
export async function resolveTrialArcEligibility(
  supabase: SupabaseClient,
  memberId: string,
  options: { now?: Date; launch?: string | null } = {}
): Promise<TrialArcEligibility> {
  const facts = await fetchRelationshipFacts(supabase, memberId);
  return decideTrialArcEligibility({
    facts,
    now: options.now ?? new Date(),
    ...(options.launch !== undefined ? { launch: options.launch } : {}),
  });
}
