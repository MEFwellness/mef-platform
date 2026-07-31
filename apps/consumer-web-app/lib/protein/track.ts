/**
 * Maps a member's real membership tier (migration 69,
 * lib/assessment-registry/membership.ts) to which protein track they're
 * on. 'holistic_reset' is this platform's structured, coach-led 24-week
 * program tier; every other tier (free_trial, membership) is monthly/
 * self-guided. This is a judgment call — there is no dedicated "24-week
 * program" flag in the schema today — documented here so it's easy to
 * revisit if the business ever splits these tiers differently.
 */

import { resolveMembershipKey } from '@/lib/assessment-registry/membership';
import type { ProteinTrack } from './types';

export function resolveProteinTrack(profileMembershipTier: string | null): ProteinTrack {
  const membershipKey = resolveMembershipKey(profileMembershipTier);
  return membershipKey === 'holistic_reset' ? 'structured_program' : 'self_guided';
}
