/**
 * Where the lock sits.
 *
 * After authentication, before the member experience. Login itself always
 * works, which is the point: a member whose trial ended has to be able to
 * sign in again after paying, and would otherwise be locked out of the very
 * screen that tells them how to.
 *
 * The set of screens it covers is MEMBER_ONLY_PREFIXES from
 * lib/auth/staffRouting.ts, reused rather than restated. That list is
 * already this codebase's one definition of "a screen a member engages
 * with", derived in turn from PRODUCT_SURFACES, so the trial lock and the
 * staff redirect cannot come to disagree about what the member app is, and
 * a member surface added later is covered by both the day it is listed.
 *
 * Deliberately outside it, and each for its own reason:
 *   - /trial-ended itself, or the redirect would be a loop.
 *   - /account/password, /help, /about: role neutral, and a locked member
 *     must still be able to change their own password.
 *   - /login, /signup, /verify, /reset-password: the auth flow.
 *   - /api/: data endpoints. Row level security governs every one of them
 *     and the member's data is deliberately untouched by this build, so
 *     there is nothing here for a routing rule to protect. Same reasoning
 *     the staff routing rule already uses for the same paths.
 */

import { isMemberOnlyPath } from '../auth/staffRouting';

export const TRIAL_ENDED_PATH = '/trial-ended';

export interface MemberAccessRoutingInput {
  hasUser: boolean;
  /** True for an account holding an active coach or platform administrator grant. Staff are redirected off member screens before this rule is ever reached. */
  isStaff: boolean;
  /** decideMemberAccess()'s answer for this account. */
  allowed: boolean;
  path: string;
}

/**
 * Where this request must go instead of rendering, or null to let it
 * through untouched.
 *
 * Returns null for every signed out request, every staff account, every
 * account the decision allows, and every path outside the member app. In
 * other words it returns a destination only for the exact case it exists
 * for: a signed in member, locked, heading for a member screen.
 */
export function memberAccessRedirectFor(input: MemberAccessRoutingInput): string | null {
  if (!input.hasUser) return null;
  if (input.isStaff) return null;
  if (input.allowed) return null;
  if (!isMemberOnlyPath(input.path)) return null;
  if (input.path === TRIAL_ENDED_PATH || input.path.startsWith(`${TRIAL_ENDED_PATH}/`)) return null;
  return TRIAL_ENDED_PATH;
}
