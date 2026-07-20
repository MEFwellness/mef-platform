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
  if (profileMembershipTier === 'free_trial' || profileMembershipTier === 'membership' || profileMembershipTier === 'holistic_reset') {
    return profileMembershipTier;
  }
  return DEFAULT_MEMBERSHIP_KEY;
}

export function membershipMeetsMinimum(memberLevel: MembershipKey, minLevel: MembershipKey): boolean {
  return MEMBERSHIP_RANK[memberLevel] >= MEMBERSHIP_RANK[minLevel];
}
