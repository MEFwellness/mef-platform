/**
 * The lock decision. One function, and every screen in the app is on one
 * side of it or the other.
 *
 * WHAT IT IS NOT. Like lib/auth/staffRouting.ts, this is a routing rule for
 * the sake of a coherent experience, not an authorization boundary. Row
 * level security is what decides which rows any account may read or write,
 * and it does so whether or not this file is correct. A locked member's
 * data is not hidden, moved, deleted or degraded in any way: it is all
 * still there, still theirs, and still exactly as it was the day their
 * trial ended.
 *
 * THE FAILURE DIRECTION IS TOWARDS THE MEMBER. A missing subscription row,
 * a row this module cannot make sense of, or a failed read all resolve to
 * "let them in". Every other decision in this codebase fails the same way
 * (hasActiveRole returns false, staffRedirectFor returns null), and the
 * reason is the same: shutting a paying member out of a product they paid
 * for because a lookup broke is far worse than letting one expired trial
 * run a day longer.
 */

import type { AccessTier, MemberAccessFacts, MemberSubscription } from './types';

/**
 * The trial is 30 days. The database holds the same number in
 * public.member_trial_length_days(), and
 * tests/membership-access-integration.test.ts asserts the row the database
 * stamps at account creation is exactly this many days long, so the two
 * cannot drift without a test failing.
 */
export const TRIAL_LENGTH_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a trial that started at `startedAt` ends. The only place this arithmetic happens. */
export function trialEndFor(startedAt: Date): Date {
  return new Date(startedAt.getTime() + TRIAL_LENGTH_DAYS * DAY_MS);
}

/**
 * Whole days left in the trial, never negative. Zero means the trial is
 * over or ends within the next 24 hours, which is why nothing decides
 * access from this: `decideMemberAccess` compares the instants themselves.
 */
export function trialDaysRemaining(trialEndsAt: Date, now: Date): number {
  const remaining = trialEndsAt.getTime() - now.getTime();
  if (remaining <= 0) return 0;
  return Math.floor(remaining / DAY_MS);
}

/** Whether the trial window is still open at `now`. Exclusive at the end: the instant the trial ends, it has ended. */
export function isTrialOpen(trialEndsAt: Date, now: Date): boolean {
  return now.getTime() < trialEndsAt.getTime();
}

/**
 * Why the app is open, or why it is shut. Every value is a fact about the
 * account, never about the member.
 */
export type AccessReason =
  /** No subscription row at all. Fails open, see this file's header. */
  | 'no_subscription'
  /** A seeded QA account with no assignment of its own. The trial clock never locks one out. */
  | 'test_account'
  /** A full_access grant. Beats everything, including an expired trial. */
  | 'full_access'
  /** monthly, annual or program, status active. */
  | 'active_tier'
  /** On trial, inside the window. */
  | 'trial_active'
  /** On trial, past the window. This is the case the lock screen exists for. */
  | 'trial_expired'
  /** Explicitly set to no access by an administrator. */
  | 'tier_none'
  /** A real tier whose assignment is expired or canceled. */
  | 'subscription_inactive';

export interface AccessDecision {
  allowed: boolean;
  reason: AccessReason;
}

/** The tiers that grant access on their own, given an active status. Mirrors member_access_tiers.grants_access, minus trial, whose window is checked separately. */
const STANDING_TIERS: readonly AccessTier[] = ['monthly', 'annual', 'program'];

export interface AccessDecisionInput extends MemberAccessFacts {
  now: Date;
}

/**
 * May this account open the member app.
 *
 * The order of these rules is the whole design, so it is worth stating
 * each one's reason rather than leaving the sequence to be inferred:
 *
 *   1. No row: let them in. See the header.
 *   2. full_access: let them in, whatever else the row says. It is the
 *      manually assignable "this person has the whole platform" grant, for
 *      coaching clients who pay outside the app entirely, and a grant that
 *      could be overruled by a stale tier would be no grant at all.
 *   3. A test account that nobody has assigned anything to: let them in.
 *      This is the brief's "exclude test accounts from expiry lockout",
 *      and it is scoped to the automatic trial clock alone. The moment an
 *      administrator assigns a test account something, that assignment is
 *      what decides, which is what makes the lock verifiable on a real
 *      account without waiting 30 days.
 *   4. Explicitly no access: shut. This is Osei expiring somebody by hand,
 *      and it beats a trial window that happens to still be open.
 *   5. A non-active status on any tier: shut. Where a canceled or lapsed
 *      billing subscription will land, once there is one.
 *   6. On trial: open while the window is open, shut once it is not.
 *   7. Anything else standing and active: open.
 *
 * Rules 4 to 7 read the row exactly the same way whether its source is
 * manual or billing, which is the brief's "the app treats both
 * identically". The difference between them lives entirely at the database,
 * in what may write them.
 */
export function decideMemberAccess(input: AccessDecisionInput): AccessDecision {
  const { subscription, isTest, now } = input;

  if (!subscription) return { allowed: true, reason: 'no_subscription' };

  if (subscription.fullAccess) return { allowed: true, reason: 'full_access' };

  const assigned = subscription.source !== 'system';
  if (isTest && !assigned) return { allowed: true, reason: 'test_account' };

  if (subscription.tier === 'none') return { allowed: false, reason: 'tier_none' };

  if (subscription.status !== 'active') {
    return { allowed: false, reason: 'subscription_inactive' };
  }

  if (subscription.tier === 'trial') {
    const endsAt = new Date(subscription.trialEndsAt);
    if (Number.isNaN(endsAt.getTime())) {
      // An unparseable date is a broken row, not an expired member.
      return { allowed: true, reason: 'no_subscription' };
    }
    return isTrialOpen(endsAt, now)
      ? { allowed: true, reason: 'trial_active' }
      : { allowed: false, reason: 'trial_expired' };
  }

  if (STANDING_TIERS.includes(subscription.tier)) {
    return { allowed: true, reason: 'active_tier' };
  }

  // Unreachable while ACCESS_TIERS holds five values and all five are
  // handled above. Reached only by a tier key added to the database and not
  // yet to this module, in which case the member keeps their app.
  return { allowed: true, reason: 'no_subscription' };
}

/**
 * A one-line description of the state, for the administrator's panel.
 * Never rendered on a member screen.
 */
export function describeAccess(decision: AccessDecision): string {
  switch (decision.reason) {
    case 'no_subscription':
      return 'No record yet (open)';
    case 'test_account':
      return 'Test account (open)';
    case 'full_access':
      return 'Full access (open)';
    case 'active_tier':
      return 'Paid tier (open)';
    case 'trial_active':
      return 'Trial running (open)';
    case 'trial_expired':
      return 'Trial complete (locked)';
    case 'tier_none':
      return 'No access (locked)';
    case 'subscription_inactive':
      return 'Not active (locked)';
  }
}

/** The subscription shape from a database row, normalised. Kept beside the decision so a row and its decision are never built from different assumptions. */
export function subscriptionFromRow(row: {
  member_id: string;
  tier: string;
  source: string;
  status: string;
  full_access: boolean;
  trial_started_at: string;
  trial_ends_at: string;
}): MemberSubscription {
  return {
    memberId: row.member_id,
    tier: row.tier as MemberSubscription['tier'],
    source: row.source as MemberSubscription['source'],
    status: row.status as MemberSubscription['status'],
    fullAccess: row.full_access,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
  };
}
