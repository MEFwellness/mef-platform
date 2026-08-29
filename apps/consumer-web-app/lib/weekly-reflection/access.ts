/**
 * Who the Weekly Reflection is for. One function, and every surface in the
 * feature is on one side of it.
 *
 * THE PLAN IS THE WHOLE GATE. member_subscriptions.tier (migration 159),
 * read through the member_access_facts view by
 * lib/membership/service.ts's fetchMemberAccessFacts, decides this and
 * nothing else does. There is no assignment, no grant column, no
 * visibility-layer key and no coach switch: adding one would be exactly
 * the "second invisible lock" the standing rules forbid, and it would make
 * "why can she not see it" a two place question.
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
