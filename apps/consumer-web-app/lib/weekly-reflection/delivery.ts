/**
 * Did the Weekly Reflection reach her this week, and what does a coach get
 * to say about it.
 *
 * THE QUESTION THIS ANSWERS. A blank Weekly Reflection panel used to mean
 * either "she was shown it and did not write it" or "she never opened the
 * app", and those are opposite facts that call for opposite conversations.
 * A delivery receipt (migration 191) separates them.
 *
 * FOUR STATES, NOT THREE, AND THE FOURTH IS THE HONEST ONE. There is a
 * real difference between "no receipt exists, and one would have been
 * written if it had reached her" and "no receipt exists, because nothing
 * was recording receipts yet". Collapsing them would put a sentence on a
 * coach's screen that says she never opened the app, about a weekend the
 * app was not watching. So a week that started before
 * DELIVERY_RECEIPTS_FIRST_WEEK resolves to `no_record`, and a read that
 * failed resolves to `unreadable`. Neither ever claims delivery, and
 * neither ever claims non-delivery.
 *
 * A COMPLETION OUTRANKS EVERYTHING. She cannot finish a reflection that
 * never reached her, so a completed week is reported as completed whether
 * or not a receipt was written for it. That is what makes every week
 * before this build still readable rather than a wall of "no record".
 *
 * PURE. No clock, no database, no timezone of its own. The week, the two
 * timestamps and the reading zone all arrive from the caller, which is the
 * server, which resolved them from her stored profile timezone.
 */

import { formatDisplayDate, formatInTimeZone } from '../time/displayDate';

/**
 * The first Friday whose ENTIRE window this receipt system was live for.
 *
 * Delivery receipts shipped on Saturday 2026-08-29, in the middle of the
 * 2026-08-28 window, so that week's Friday showings were never recorded
 * and an absent receipt for it proves nothing. From 2026-09-04 onward an
 * absent receipt is a real fact, and only from then may the status line
 * say she has not opened the app.
 *
 * A receipt that DOES exist is always believed, including for an earlier
 * week: the row could only have been written by a real display.
 */
export const DELIVERY_RECEIPTS_FIRST_WEEK = '2026-09-04';

export type ReflectionDeliveryStatus =
  /** Finished. The strongest fact available, and it implies delivery. */
  | { kind: 'completed'; weekStart: string; at: string | null }
  /** A receipt exists and no completion does. */
  | { kind: 'delivered'; weekStart: string; at: string }
  /** No receipt, in a week this system was watching the whole of. */
  | { kind: 'not_delivered'; weekStart: string }
  /** No receipt, in a week that closed before this system existed. */
  | { kind: 'no_record'; weekStart: string }
  /** One of the two reads failed. We know nothing, and say so. */
  | { kind: 'unreadable'; weekStart: string };

/**
 * The one place the four states are decided, from the two facts and the
 * week alone.
 *
 * `completedAt` without a timestamp is deliberately not treated as a
 * completion: the copy below names the day, and a completion with no day
 * to name is not something to announce. It falls through to whatever the
 * receipt says instead.
 */
export function resolveReflectionDeliveryStatus(input: {
  weekStart: string;
  deliveredAt: string | null;
  completedAt: string | null;
  /** False when either underlying read failed. Never guess from an empty result. Omitted means "both reads worked". */
  readable?: boolean | undefined;
}): ReflectionDeliveryStatus {
  const { weekStart, deliveredAt, completedAt } = input;
  if (input.readable === false) return { kind: 'unreadable', weekStart };
  if (completedAt) return { kind: 'completed', weekStart, at: completedAt };
  if (deliveredAt) return { kind: 'delivered', weekStart, at: deliveredAt };
  if (weekStart < DELIVERY_RECEIPTS_FIRST_WEEK) return { kind: 'no_record', weekStart };
  return { kind: 'not_delivered', weekStart };
}

/**
 * The weekday name an instant fell on, in the member's own zone, or null.
 *
 * Null rather than a sentinel string, so the copy below can drop the day
 * from the sentence instead of printing "date not available" in the middle
 * of one. Never "Invalid Date": formatInTimeZone returns its own
 * unavailable text for anything that will not parse, and that text is what
 * this recognises.
 */
export function reflectionDayName(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const text = formatInTimeZone(iso, { weekday: 'long' }, timeZone);
  return /^[A-Za-z]+$/.test(text) ? text : null;
}

/**
 * "Aug 28", for naming which week a past-tense line is about.
 *
 * A bare YYYY-MM-DD parses as UTC midnight, so UTC is the zone that gives
 * back the same calendar day it was stored as, in every reader's zone.
 * That is what formatDisplayDate is, and it is what the panel's own week
 * chips already use, so a chip and this line can never name the week
 * differently.
 */
function formatWeekStart(weekStart: string): string {
  const text = formatDisplayDate(weekStart, { month: 'short', day: 'numeric' });
  return /^[A-Za-z]+ \d+$/.test(text) ? text : weekStart;
}

/**
 * The single sentence a coach reads above the answers.
 *
 * TWO TENSES, ONE SET OF FACTS. Inside her Friday-to-Sunday window the
 * line is about right now and needs no week named, because "this week" is
 * the only week it could be about. Outside it, the window has closed and
 * the line names the week it is reporting on, so a coach glancing at it on
 * a Wednesday is never left thinking it describes today.
 *
 * NO EM DASHES. Periods, commas, colons and parentheses.
 *
 * "They" rather than "she": this renders for every client on a coach's
 * caseload, and the panel beside it already says "them".
 */
export function reflectionStatusLine(
  status: ReflectionDeliveryStatus,
  options: { windowOpen: boolean; timeZone: string }
): string {
  const { windowOpen, timeZone } = options;
  const week = formatWeekStart(status.weekStart);

  switch (status.kind) {
    case 'completed': {
      const day = reflectionDayName(status.at, timeZone);
      if (windowOpen) return day ? `Completed ${day}.` : 'Completed this week.';
      return day ? `Week of ${week}: completed ${day}.` : `Week of ${week}: completed.`;
    }
    case 'delivered': {
      const day = reflectionDayName(status.at, timeZone);
      if (windowOpen) {
        return day ? `Delivered ${day}. Not yet completed.` : 'Delivered this week. Not yet completed.';
      }
      return day
        ? `Week of ${week}: delivered ${day}, not completed.`
        : `Week of ${week}: delivered, not completed.`;
    }
    case 'not_delivered':
      return windowOpen
        ? 'Not delivered yet. They have not opened the app since Friday.'
        : `Week of ${week}: not delivered. They did not open the app that weekend.`;
    case 'no_record':
      return windowOpen
        ? 'No delivery record for this week.'
        : `Week of ${week}: no delivery record.`;
    case 'unreadable':
      return windowOpen
        ? 'The delivery record for this week could not be read.'
        : `Week of ${week}: the delivery record could not be read.`;
  }
}
