/**
 * Priority Card — the "Building on yesterday..." trigger.
 *
 * Pure, no I/O, so the one condition that decides whether the adaptation
 * sequence runs is directly testable with no database and no rendering,
 * the same draft/service split ./select.ts already uses.
 *
 * This decides nothing about WHAT today's priority is. `selectPriority`
 * is untouched by this build and cannot see this file. All this answers
 * is a presentation question: did Root visibly adapt between yesterday
 * and today, such that showing the member the handover is honest?
 *
 * Three conditions, all required:
 *
 *   1. Yesterday means yesterday. The immediately preceding calendar
 *      day, never "the last day she happened to have a row". Bridging
 *      from something she completed five days ago and calling it
 *      yesterday would be a straightforward lie, and the whole point of
 *      the sequence is that she can trust it as a record of what she did.
 *   2. She actually completed it. A priority she saved for later or left
 *      active is not something today can build on, and replaying it
 *      would read as Root reminding her what she did not do — precisely
 *      the guilt lib/return-greeting/ exists to avoid.
 *   3. Today's priority is genuinely different. If Root landed on the
 *      same thing again there is no adaptation to show, and animating
 *      one would be decoration claiming to be a state change.
 *
 * Any of the three failing means no bridge and the ordinary entrance,
 * which is what `null` is.
 */

import { addDaysToLocalDate } from '../feed/dateMath';
import type { DailyPriorityRecord, PriorityBridge, SelectedPriority } from './types';

/** The calendar day before `localDate`, in the member's own local dates. */
export function previousLocalDate(localDate: string): string {
  return addDaysToLocalDate(localDate, -1);
}

/**
 * Whether two priorities are the same thing.
 *
 * `priorityKey` is the real identity when both have one (a plan id, a
 * driver id, a feed item id) — it survives a reworded title, which the
 * displayed text does not. The two fallback rules deliberately carry a
 * null key, so for those the title is the only identity there is, and
 * comparing titles is correct rather than a fallback: two `daily_reset`
 * days genuinely are the same priority.
 */
export function isSamePriority(
  yesterday: Pick<DailyPriorityRecord, 'rule' | 'priorityKey' | 'title'>,
  today: Pick<SelectedPriority, 'rule' | 'priorityKey' | 'title'>
): boolean {
  if (yesterday.priorityKey !== null && today.priorityKey !== null) {
    return yesterday.priorityKey === today.priorityKey;
  }
  if (yesterday.priorityKey !== today.priorityKey) return false;
  return yesterday.rule === today.rule && yesterday.title === today.title;
}

/**
 * The bridge to show, or null for the ordinary entrance.
 *
 * `yesterday` is whatever row exists for the previous calendar day, or
 * null when there is none. `todayLocalDate` is passed in rather than
 * derived so this function has no clock in it and its tests are not
 * date-dependent.
 */
export function buildPriorityBridge(
  yesterday: DailyPriorityRecord | null,
  today: SelectedPriority,
  todayLocalDate: string
): PriorityBridge | null {
  if (!yesterday) return null;

  // Condition 1 — the row must be for the immediately preceding day.
  // Guards against a caller handing over "her most recent row" instead
  // of "yesterday's row", which is the mistake that would make the copy
  // untrue without changing anything visible in code review.
  if (yesterday.localDate !== previousLocalDate(todayLocalDate)) return null;

  // Condition 2 — she completed it.
  if (yesterday.status !== 'done') return null;

  // Condition 3 — today is a different priority.
  if (isSamePriority(yesterday, today)) return null;

  return { yesterdayTitle: yesterday.title };
}
