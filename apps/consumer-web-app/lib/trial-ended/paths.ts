/**
 * The continuation screen's two addresses, in a file that imports nothing.
 *
 * WHY THEY ARE NOT READ FROM lib/membership/routing.ts. The renderer next
 * door is guarded to reach no membership module anywhere in its import
 * graph, which is the property that lets it render on a screen where every
 * entitlement gate would answer no. A path is a string, not a gate, so it
 * lives here where both sides can have it.
 *
 * lib/membership/routing.ts re-exports these rather than declaring its own,
 * so there is still exactly one definition of each.
 */

/** The day 8 soft continuation screen. */
export const TRIAL_ENDED_PATH = '/trial-ended';

/**
 * Her own week, re-readable after it has ended.
 *
 * A CHILD OF THE LOCK SCREEN, and that is the whole reason no entitlement
 * rule had to be relaxed for it. '/trial/week' is a member surface, so the
 * lock covers it and a member on day 8 is redirected off it. The lock
 * already lets the '/trial-ended' subtree through, because it has to, so
 * rendering her stored recap at this address is not a new exception at all.
 */
export const TRIAL_ENDED_WEEK_PATH = '/trial-ended/week';
