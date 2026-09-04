/**
 * WHAT IS THIS ACCOUNT'S RELATIONSHIP TO THE PRACTICE, RIGHT NOW.
 *
 * One question, one answer, one place. Pure derivation: nothing here is
 * stored, nothing here is written, and nothing here is cached. Ask it
 * again a second later and it answers from the same rows the first call
 * read.
 *
 * WHY IT IS NOT THE SAME QUESTION AS lib/membership/access.ts.
 * decideMemberAccess answers "may this account open the app". This answers
 * "who is this to us". A locked-out account whose trial ended is still a
 * PROSPECT; a coaching client whose subscription row says nothing at all is
 * still an ACTIVE_COACHING_CLIENT. The two answers are allowed to disagree
 * because they are about different things, and neither is derived from the
 * other.
 *
 * THE ORDER IS THE DESIGN, and first match wins:
 *
 *   1. ACTIVE_COACHING_CLIENT. There is an active row in
 *      coach_client_assignments. A person Osei is actually coaching is that
 *      first, whatever they pay and however they pay it, so this outranks
 *      every tier. A paying member who is also being coached is a coaching
 *      client, not a member who happens to have a coach.
 *
 *   2. APP_ONLY_MEMBER. The subscription row says monthly, annual or
 *      program, or it carries the full_access grant. Somebody who has paid
 *      for the product and is using it on their own.
 *
 *   3. PROSPECT. Everybody else, which deliberately includes both the
 *      account on the untouched free trial and the account with no
 *      subscription row at all. Not an error, not an unknown, not a
 *      fallback: a signup with no entitlement row is exactly as much a
 *      prospect as one holding a trial, and treating it as a failure would
 *      make the arc skip the very people it was built for.
 *
 * ONLY 'active' MAKES SOMEBODY A CLIENT. A revoked or completed assignment
 * is a relationship that ended, and it is answered here as whatever the
 * account is today. That is not the same question as "has this account
 * ever been assigned a coach", which the trial arc asks separately and
 * which `everCoachAssigned` below reports, because the arc's rule is
 * permanent exclusion and this module's rule is about right now.
 *
 * FAILING READS ARE REPORTED, NOT GUESSED. A read that failed sets
 * `readFailed` and is never quietly treated as "no assignment" or "no
 * subscription". Callers that must not act on a guess (the trial arc is
 * one) refuse on that flag; callers that only want a label can use the
 * derived type and accept that it was derived from less.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isAccessSource, isAccessStatus, isAccessTier } from './types';
import type { AccessSource, AccessStatus, AccessTier } from './types';

export const RELATIONSHIP_TYPES = [
  'ACTIVE_COACHING_CLIENT',
  'APP_ONLY_MEMBER',
  'PROSPECT',
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** How each type is named in plain language, for a log line or an administrator's screen. Never rendered to a member. */
export const RELATIONSHIP_LABEL: Record<RelationshipType, string> = {
  ACTIVE_COACHING_CLIENT: 'Coaching client',
  APP_ONLY_MEMBER: 'App member',
  PROSPECT: 'Prospect',
};

/** The tiers that make somebody a member of the app in their own right. */
const MEMBER_TIERS: readonly AccessTier[] = ['monthly', 'annual', 'program'];

/**
 * Everything the derivation looked at, handed back with the answer so a
 * caller can log why, or branch on one of the underlying facts, without
 * going back to the database for rows this module already read.
 */
export interface RelationshipFacts {
  memberId: string;
  /** True when at least one coach_client_assignments row has status 'active'. */
  activeCoachAssignment: boolean;
  /** True when a coach_client_assignments row exists in ANY status, including revoked and completed. */
  everCoachAssigned: boolean;
  /** Every distinct assignment status this account holds, for the log line. */
  coachAssignmentStatuses: readonly string[];
  /** False when there is no member_subscriptions row at all. A known and expected shape, not an error. */
  hasSubscription: boolean;
  tier: AccessTier | null;
  source: AccessSource | null;
  status: AccessStatus | null;
  fullAccess: boolean;
  isTest: boolean;
  /** The account's own creation instant, from profiles. Null when the profile could not be read. */
  accountCreatedAt: string | null;
  /** Migration 203's stamp. Read here so a caller gets it in the same round trip; this module never acts on it. */
  trialArcSuppressedAt: string | null;
  /** True when any of the three reads failed. The facts around it are then incomplete, not false. */
  readFailed: boolean;
}

export interface Relationship {
  type: RelationshipType;
  facts: RelationshipFacts;
}

/**
 * The derivation itself, over facts already in hand. Pure, synchronous and
 * total: every combination of inputs produces one of the three answers.
 *
 * A note on rule 2, stated because it is a real choice and not an
 * oversight: `status` is NOT consulted. Somebody whose monthly subscription
 * lapsed still shows as APP_ONLY_MEMBER here. This module answers who
 * somebody is to the practice, and lib/membership/access.ts already answers
 * whether their app is open; folding the second question into the first
 * would put one fact in two places and let them disagree. If the intent
 * ever becomes "a lapsed member is a prospect again", it changes here, once.
 */
export function deriveRelationship(facts: RelationshipFacts): RelationshipType {
  if (facts.activeCoachAssignment) return 'ACTIVE_COACHING_CLIENT';
  if (facts.fullAccess) return 'APP_ONLY_MEMBER';
  if (facts.tier !== null && MEMBER_TIERS.includes(facts.tier)) return 'APP_ONLY_MEMBER';
  return 'PROSPECT';
}

/**
 * The reads. Three of them, in parallel, all of them governed by the
 * ordinary policies:
 *
 *   coach_client_assignments  a member reads their own rows
 *                             (client_read_own_assignments, migration 16),
 *                             an administrator reads everybody's.
 *   member_subscriptions      a member reads their own row
 *                             (member_read_own_subscription, migration 159).
 *   profiles                  a member reads their own row.
 *
 * So this function answers for the signed-in member from her own session,
 * and for anybody from an administrator's session or the service role,
 * without a security definer function of its own.
 */
export async function fetchRelationshipFacts(
  supabase: SupabaseClient,
  memberId: string
): Promise<RelationshipFacts> {
  const [assignments, subscription, profile] = await Promise.all([
    supabase.from('coach_client_assignments').select('status').eq('client_id', memberId),
    supabase
      .from('member_subscriptions')
      .select('tier, source, status, full_access, trial_arc_suppressed_at')
      .eq('member_id', memberId)
      .maybeSingle(),
    supabase.from('profiles').select('is_test, created_at').eq('id', memberId).maybeSingle(),
  ]);

  const readFailed = Boolean(assignments.error || subscription.error || profile.error);
  if (assignments.error) console.error('fetchRelationshipFacts assignments failed', assignments.error);
  if (subscription.error) console.error('fetchRelationshipFacts subscription failed', subscription.error);
  if (profile.error) console.error('fetchRelationshipFacts profile failed', profile.error);

  const rows = (assignments.data ?? []) as { status: string }[];
  const statuses = [...new Set(rows.map((row) => row.status))];
  const row = subscription.data as {
    tier: string | null;
    source: string | null;
    status: string | null;
    full_access: boolean | null;
    trial_arc_suppressed_at: string | null;
  } | null;

  const rawTier = row?.tier ?? null;
  const rawSource = row?.source ?? null;
  const rawStatus = row?.status ?? null;

  return {
    memberId,
    activeCoachAssignment: rows.some((assignment) => assignment.status === 'active'),
    everCoachAssigned: rows.length > 0,
    coachAssignmentStatuses: statuses,
    hasSubscription: row !== null,
    tier: isAccessTier(rawTier) ? rawTier : null,
    source: isAccessSource(rawSource) ? rawSource : null,
    status: isAccessStatus(rawStatus) ? rawStatus : null,
    fullAccess: Boolean(row?.full_access),
    isTest: Boolean((profile.data as { is_test: boolean | null } | null)?.is_test),
    accountCreatedAt: (profile.data as { created_at: string | null } | null)?.created_at ?? null,
    trialArcSuppressedAt: row?.trial_arc_suppressed_at ?? null,
    readFailed,
  };
}

/**
 * The whole answer in one call: read the facts, derive the type, hand both
 * back. This is what a caller wants nine times out of ten, and the reason
 * the facts travel with the answer is so the tenth caller does not go and
 * re-query for a fact this function already had.
 */
export async function resolveRelationship(
  supabase: SupabaseClient,
  memberId: string
): Promise<Relationship> {
  const facts = await fetchRelationshipFacts(supabase, memberId);
  return { type: deriveRelationship(facts), facts };
}

/** One line describing how the answer was reached, for a log or an administrator's screen. Never shown to a member. */
export function describeRelationship(relationship: Relationship): string {
  const { type, facts } = relationship;
  switch (type) {
    case 'ACTIVE_COACHING_CLIENT':
      return 'Coaching client (active coach assignment)';
    case 'APP_ONLY_MEMBER':
      return facts.fullAccess
        ? 'App member (full access grant)'
        : `App member (${facts.tier ?? 'unknown'} plan)`;
    case 'PROSPECT':
      if (!facts.hasSubscription) return 'Prospect (no membership record)';
      return facts.tier === 'trial' ? 'Prospect (on the free trial)' : `Prospect (${facts.tier ?? 'unknown'} plan)`;
  }
}
