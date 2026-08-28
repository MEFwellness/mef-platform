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

import { getMyStoredPriority } from '../priority/view';
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
 * The member's one focus, or null when Root has not decided one today.
 *
 * READS, NEVER DECIDES (2026-08-27). This used to run the whole priority
 * engine, which claims today's row as a side effect. Every surface that
 * names the focus therefore had the power to fix it: opening Movement, the
 * Root Map, Recommendations or the Root Score first thing in the morning
 * decided her one thing for the day before she had checked in, and asking
 * Root a question in the chat did the same. It now reads the decision the
 * Priority Card made and reports nothing when there is not one yet, which
 * is the null this module's callers already handle by rendering no focus
 * at all.
 *
 * `reason` is deliberately null here. The engine's reason line is
 * regenerated per render against the live hierarchy and is not stored, so
 * the honest answer from a stored row is "no current reason". Every
 * surface reading this renders the title and the status, never the reason.
 *
 * Request-memoized upstream, so a page with four surfaces naming the focus
 * pays for one row read.
 */
export async function getMemberFocus(): Promise<MemberFocus | null> {
  const record = await getMyStoredPriority();
  if (!record) return null;
  return {
    title: record.title,
    reason: null,
    rule: record.rule,
    status: record.status,
    href: record.href,
  };
}
