/**
 * The Weekly Root Review — the week focus, and the only way it is allowed
 * to touch the daily engine.
 *
 * WHAT A TIE ACTUALLY IS, stated precisely, because it is the easiest thing
 * in this build to over-read.
 *
 * Part 1's ladder (lib/priority/types.ts's PRIORITY_LADDER) admits at most
 * one candidate per RUNG. Two candidates are therefore only ever "otherwise
 * equal in the hierarchy" when they sit on the SAME rung, which happens when
 * that rung's own source produced several equally-ranked items:
 *
 *   implicated_driver   Case View's likelyInvolved bucket is a LIST. Every
 *                       driver in it is, by that panel's own definition,
 *                       implicated and goal-relevant. Rule 2 has always
 *                       taken the first one.
 *   qualified_pattern   selectQualifiedPattern sorts tier 3 findings by
 *                       confidence then observation count and takes the
 *                       top. Findings that tie on both are genuinely
 *                       indistinguishable to the hierarchy.
 *
 * Among those, and only among those, the focus-aligned candidate is
 * preferred. The order of the rungs is not touched, no candidate is ever
 * promoted past a candidate on a higher rung, and no candidate is created.
 *
 * THREE RULES ARE EXEMPT, STRUCTURALLY. 'safety' and 're_entry' are
 * overrides and are not on the ladder at all, so the reorder cannot reach
 * them. 'reset_plan_commitment' IS on the ladder, and is exempted here by
 * name: a commitment the member explicitly agreed to must not be reordered
 * by a preference Root formed on her behalf. The exemption is applied to
 * the rung group rather than checked per candidate, so it is a property of
 * the data, and it is also why the focus itself may never NAME an exempt
 * rule (see `isBiasableFocus`): a focus the engine is forbidden to act on
 * would look like a decision while being inert.
 */

import type { CoachingActionType } from '../coaching-direction/types';
import type { PriorityRule } from '../priority/types';
import type { WeekFocus } from './types';

/**
 * The rules a week focus may never bias, and may never name. Declared as
 * data so the reorder, the focus chooser, and their guard tests all read
 * one list.
 */
export const FOCUS_EXEMPT_RULES: readonly PriorityRule[] = [
  'safety',
  're_entry',
  'reset_plan_commitment',
];

export const FOCUS_EXEMPT_REASON =
  'Safety, re-engagement and a commitment she agreed to are never reordered by a preference Root formed on her behalf.';

export function isFocusExemptRule(rule: PriorityRule): boolean {
  return FOCUS_EXEMPT_RULES.includes(rule);
}

/** The minimum a focus must be for the daily engine to read it at all. */
export function isBiasableFocus(focus: WeekFocus | null): focus is WeekFocus {
  if (!focus) return false;
  if (!focus.actionType && !focus.threadKey) return false;
  if (focus.threadKey) {
    const rule = focus.threadKey.split('::')[0] as PriorityRule;
    if (isFocusExemptRule(rule)) return false;
  }
  return true;
}

/**
 * Whether one candidate is aligned with the week focus.
 *
 * A thread match is stronger than an action type match and is checked
 * first, but either alone is alignment: an action type focus biases toward
 * a KIND of thing, a thread focus toward one specific continuing
 * conversation.
 */
export function isAlignedWithFocus(
  candidate: { rule: PriorityRule; threadKey: string; actionType: CoachingActionType },
  focus: WeekFocus | null
): boolean {
  if (!isBiasableFocus(focus)) return false;
  if (isFocusExemptRule(candidate.rule)) return false;
  if (focus.threadKey && candidate.threadKey === focus.threadKey) return true;
  if (focus.actionType && candidate.actionType === focus.actionType) return true;
  return false;
}

/**
 * The reorder itself: a stable partition inside each rung group, applied to
 * the ladder in place order.
 *
 * Two properties are what make this safe, and both are directly testable:
 *
 *   1. The sequence of RULES in the returned array is byte-identical to the
 *      input's. Only the order of candidates that share a rule can change.
 *   2. An exempt rung's group is returned untouched.
 *
 * `Array.prototype.sort` is deliberately not used. A stable partition into
 * aligned-then-rest is easier to reason about than a comparator, and it
 * guarantees candidates that are all aligned (or all not) keep the source's
 * own order, which is the hierarchy's existing tie-break and must survive.
 */
export function preferWeekFocusWithinRung<
  T extends { rule: PriorityRule; threadKey: string; actionType: CoachingActionType },
>(candidates: readonly T[], focus: WeekFocus | null): T[] {
  if (!isBiasableFocus(focus)) return [...candidates];

  const out: T[] = [];
  let index = 0;
  while (index < candidates.length) {
    const rule = candidates[index]!.rule;
    let end = index;
    while (end < candidates.length && candidates[end]!.rule === rule) end += 1;

    const group = candidates.slice(index, end);
    if (group.length <= 1 || isFocusExemptRule(rule)) {
      out.push(...group);
    } else {
      const aligned = group.filter((candidate) => isAlignedWithFocus(candidate, focus));
      const rest = group.filter((candidate) => !isAlignedWithFocus(candidate, focus));
      out.push(...aligned, ...rest);
    }
    index = end;
  }
  return out;
}
