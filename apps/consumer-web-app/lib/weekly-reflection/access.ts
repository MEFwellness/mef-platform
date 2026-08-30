/**
 * Who the Weekly Reflection is for. One function, and every surface in the
 * feature is on one side of it.
 *
 * THE PLAN DECIDES WHAT ARRIVES ON ITS OWN, AND A COACH ASSIGNMENT CAN
 * ONLY ADD ONE WEEK ON TOP OF IT. That is the standing access rule stated
 * exactly: membership.minLevel, here member_subscriptions.tier (migration
 * 159) read through the member_access_facts view by
 * lib/membership/service.ts's fetchMemberAccessFacts, is what makes this
 * experience turn up every Friday with nobody doing anything. A row in
 * member_weekly_reflection_assignments (migration 193) opens ONE named
 * week for ONE member, whatever her tier and whatever day it is.
 *
 * THERE IS STILL NO SECOND LOCK, because an assignment cannot close
 * anything. hasWeeklyReflectionAccess below is unchanged and still consults
 * the tier and nothing else, isWeeklyReflectionOffered below is a plain OR
 * of the two, and there is no row shape anywhere that takes the experience
 * away from a program member. "Why can she not see it" therefore still has
 * one answer for the automatic case (her plan) and one for the assigned
 * case (nobody sent her one), and neither can contradict the other.
 *
 * FAILS SHUT, WHICH IS THE OPPOSITE OF lib/membership/access.ts. That
 * module decides whether a member may open the app at all, and a broken
 * read there must never lock a paying member out, so it fails open. This
 * decides whether one extra experience is offered on top of a plan, and a
 * broken read here must never hand a monthly member something she is not
 * on. No row, an unreadable row, a failed read: not offered. The cost of
 * being wrong in this direction is one program member who does not get her
 * pop-up until the read works again, and she still has the whole rest of
 * her app.
 *
 * NOT A SECURITY BOUNDARY. Row level security is what decides which rows
 * any account may read or write. This is what decides what is offered.
 * Both are checked: the server action re-asks this question before it
 * writes, and the route re-asks it before it renders, so a typed URL is
 * turned away by the same rule the pop-up chain obeys.
 */

import type { AccessTier, MemberAccessFacts } from '../membership/types';

/** The one tier this experience belongs to. */
export const WEEKLY_REFLECTION_TIER: AccessTier = 'program';

/**
 * Whether this account is offered the Weekly Reflection.
 *
 * `full_access` deliberately does NOT open it. That flag is the "this
 * person has the whole platform" grant used for coaching clients who pay
 * outside the app, and it sits on top of whatever tier the row carries.
 * The brief scopes this experience to the program tier by name, and the
 * administrator's panel already has a way to say "put this member on the
 * program", so honouring the tier and only the tier keeps one answer to
 * "who is on the 24 week program" rather than two.
 */
export function hasWeeklyReflectionAccess(facts: MemberAccessFacts | null): boolean {
  const subscription = facts?.subscription;
  if (!subscription) return false;
  return subscription.tier === WEEKLY_REFLECTION_TIER && subscription.status === 'active';
}

/**
 * Whether this member is offered THIS week's reflection right now: the two
 * ways in, in one place, so no surface can decide it a fourth way.
 *
 * THE AUTOMATIC WAY is the plan and the calendar together, and it is
 * exactly what it was before assignments existed: on the program tier, and
 * inside her own Friday-to-Sunday window. Neither half alone opens it.
 *
 * THE ASSIGNED WAY is one row for this member and this week, and it
 * overrides BOTH halves: any tier, and any day of that week. A coach
 * pressing Assign on a Tuesday means she can write it on that Tuesday, not
 * that she waits until Friday, which would make the button a promise
 * rather than an action.
 *
 * A PLAIN OR, which is what "only ever adds" looks like in code. There is
 * no ordering between the two and no case where the assignment makes
 * something false that would otherwise have been true. A program member
 * who is also assigned this week is offered exactly the one week both
 * routes name, and she gets one delivery, because both routes resolve to
 * the same Friday.
 *
 * FAILS SHUT on the assignment side too: `assigned` is false when the read
 * failed, for the same reason the tier read failing means "not offered".
 */
export function isWeeklyReflectionOffered(input: {
  facts: MemberAccessFacts | null;
  /** Whether her own Friday-to-Sunday window is open today, in her own timezone. */
  windowOpen: boolean;
  /** Whether a coach assignment exists for the week in question. False when the read failed. */
  assigned: boolean;
}): boolean {
  if (input.assigned) return true;
  return input.windowOpen && hasWeeklyReflectionAccess(input.facts);
}
