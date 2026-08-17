/**
 * Member Interpretation Layer — the one focus.
 *
 * The Priority Card decision engine (lib/priority/select.ts) is the only
 * author of the member's current focus and primary action. This file does
 * not decide anything. It reads that engine's already-published verdict and
 * hands it to every surface that used to name a focus of its own.
 *
 * The audit counted six surfaces naming five different focuses on the same
 * morning: Home's brief said Stress, the noticing carousel said Consistency,
 * Root Score said complete a movement session, Today said take a few minutes
 * for your Daily Reset, Movement said strength and conditioning, and the
 * Root Map said stress regulation. After this, all of them read the line
 * below and there is exactly one answer.
 *
 * Deliberately thin. If it ever grows a rule, that rule belongs in the
 * priority engine instead, because a second place that can influence what
 * the focus is is a second focus.
 */

import { getMyPriorityView } from '../priority/view';
import type { PriorityView } from '../priority/types';
import type { MemberFocus } from './types';

/** Pure: the priority view reduced to what a surface naming the focus may see. */
export function toMemberFocus(view: PriorityView | null): MemberFocus | null {
  if (!view) return null;
  return {
    title: view.selected.title,
    reason: view.selected.reason,
    rule: view.selected.rule,
    status: view.status,
    href: view.selected.href,
  };
}

/**
 * The member's one focus, or null when the engine could not claim today's
 * row (which is the engine's own fail-closed state, not an absence of a
 * focus). A surface that gets null renders no focus at all rather than
 * falling back to a second source, because falling back to a second source
 * is exactly what produced five answers.
 *
 * Request-memoized upstream: getMyPriorityView already is, so a page with
 * four surfaces naming the focus pays for one computation.
 */
export async function getMemberFocus(): Promise<MemberFocus | null> {
  return toMemberFocus(await getMyPriorityView());
}
