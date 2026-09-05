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
import type { RelationshipType } from './relationship';

/**
 * The two addresses, declared in lib/trial-ended/paths.ts and re-exported
 * here so every existing caller keeps importing them from where it always
 * has. They live over there because the day 8 renderer needs them and is
 * guarded to reach no membership module at all.
 */
export { TRIAL_ENDED_PATH, TRIAL_ENDED_WEEK_PATH } from '../trial-ended/paths';
import { TRIAL_ENDED_PATH } from '../trial-ended/paths';

export interface MemberAccessRoutingInput {
  hasUser: boolean;
  /** True for an account holding an active coach or platform administrator grant. Staff are redirected off member screens before this rule is ever reached. */
  isStaff: boolean;
  /** decideMemberAccess()'s answer for this account. */
  allowed: boolean;
  /**
   * Who this account is to the practice, from lib/membership/relationship.ts.
   *
   * ADDED 2026-09-05, WHEN /trial-ended STOPPED BEING A GENERIC LOCK SCREEN.
   * It is now the day 8 continuation state for a PROSPECT: it preserves her
   * own first week, offers the two doors, and says her free week is
   * complete. Every sentence on it is true of somebody who came in on the
   * automatic free trial and is false of anybody else. Sending a coaching
   * client or a paid member there would be telling them a story about a
   * trial they never had.
   */
  relationship: RelationshipType;
  path: string;
}

/**
 * Where this request must go instead of rendering, or null to let it
 * through untouched.
 *
 * Returns null for every signed out request, every staff account, every
 * account the decision allows, every account that is not a prospect, and
 * every path outside the member app. In other words it returns a
 * destination only for the exact case it exists for: a signed in prospect,
 * locked, heading for a member screen.
 *
 * WHAT THE RELATIONSHIP RULE COSTS, STATED PLAINLY RATHER THAN HIDDEN.
 * An account that is locked by decideMemberAccess and is NOT a prospect now
 * keeps the member app instead of being redirected. Two shapes can reach
 * that: an active coaching client whose automatic trial window happens to
 * have run out, and a paid member whose subscription status is no longer
 * active.
 *
 * For the first, this is not a concession, it is the standing rule: a coach
 * assignment only ever ADDS, and a person Osei is actually coaching is a
 * coaching client whatever a trial clock says.
 *
 * For the second it is a deliberate, temporary answer to a screen that does
 * not exist yet. There is no lock screen written for a lapsed paid member,
 * and this codebase fails towards the member everywhere else in this
 * module. Given the choice between showing her a screen about a free trial
 * she never took and leaving her app open until the right screen exists,
 * the app stays open. No production account is in either shape today.
 */
export function memberAccessRedirectFor(input: MemberAccessRoutingInput): string | null {
  if (!input.hasUser) return null;
  if (input.isStaff) return null;
  if (input.allowed) return null;
  if (input.relationship !== 'PROSPECT') return null;
  if (!isMemberOnlyPath(input.path)) return null;
  if (input.path === TRIAL_ENDED_PATH || input.path.startsWith(`${TRIAL_ENDED_PATH}/`)) return null;
  return TRIAL_ENDED_PATH;
}
