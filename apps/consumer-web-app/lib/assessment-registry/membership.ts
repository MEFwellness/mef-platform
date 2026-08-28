import type { MembershipKey } from './types';

/**
 * Membership tiers are additive to the existing role-based auth model, not
 * a replacement for it. `lib/auth/guards.ts`'s hasActiveRole()/RLS's
 * has_active_role() still decide member/coach/admin access exactly as
 * before — this only decides which *tier* a member is on, layered on top
 * via the new `profiles.membership_tier` column (see
 * supabase/migrations/00000000000069_membership_tiers.sql). Every
 * pre-existing profile was backfilled to 'membership' at migration time
 * (see that migration's comment for why), so this never narrows access
 * for an existing user relative to today's actual (ungated) behavior.
 */
const DEFAULT_MEMBERSHIP_KEY: MembershipKey = 'membership';

const MEMBERSHIP_RANK: Record<MembershipKey, number> = {
  free_trial: 0,
  membership: 1,
  holistic_reset: 2,
};

/** profiles.membership_tier is nullable at the DB level for defensiveness; this is the single place that resolves the fallback. */
export function resolveMembershipKey(profileMembershipTier: string | null): MembershipKey {
  if (
    profileMembershipTier === 'free_trial' ||
    profileMembershipTier === 'membership' ||
    profileMembershipTier === 'holistic_reset'
  ) {
    return profileMembershipTier;
  }
  return DEFAULT_MEMBERSHIP_KEY;
}

export function membershipMeetsMinimum(
  memberLevel: MembershipKey,
  minLevel: MembershipKey
): boolean {
  return MEMBERSHIP_RANK[memberLevel] >= MEMBERSHIP_RANK[minLevel];
}

/**
 * THE PLAN IS THE GATE (2026-08-27).
 *
 * Two tier vocabularies exist and they are not the same thing.
 * `member_subscriptions.tier` (lib/membership/types.ts, migration 159) is
 * the plan Osei actually assigns on /admin/access: trial, monthly, annual,
 * 24 week program. `profiles.membership_tier` (migration 69) is the older
 * free_trial / membership / holistic_reset column the registry map is
 * written in, and on production it is NULL for every account but one,
 * which `resolveMembershipKey` resolves to 'membership'. Reading it alone
 * therefore said "everybody is on the paid tier" and gated nothing.
 *
 * This is the one place the two vocabularies meet. The registry map is
 * unchanged; only which column answers "what is she on" changes.
 *
 * FAILS CLOSED, deliberately, and in the opposite direction to
 * lib/membership/access.ts. That module decides whether the app opens at
 * all, and shutting a paying member out of everything is the worse
 * mistake, so it fails open. This one decides whether one questionnaire
 * opens, and the mistake it exists to stop is offering a clinical
 * questionnaire to somebody whose plan does not include it. A missing or
 * inactive subscription therefore resolves to the most restrictive live
 * plan, never to the most permissive one. Her own completed results are
 * never hidden by this: that protection lives in access.ts's 'view'
 * intent, not here.
 */
export function membershipKeyForAccessTier(
  tier: string | null,
  status: string | null
): MembershipKey {
  if (status !== null && status !== 'active') return 'free_trial';
  switch (tier) {
    case 'program':
      return 'holistic_reset';
    case 'monthly':
    case 'annual':
      return 'membership';
    case 'trial':
    case 'none':
      return 'free_trial';
    default:
      return 'free_trial';
  }
}

/** How a required plan level is named to a member. The same words /admin/access uses, so the sheet and the admin panel cannot disagree. */
export const MEMBERSHIP_PLAN_NAME: Record<MembershipKey, string> = {
  free_trial: 'trial',
  membership: 'Monthly plan',
  holistic_reset: '24 week program',
};
