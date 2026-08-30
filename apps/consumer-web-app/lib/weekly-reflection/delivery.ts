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
 * AN ASSIGNED WEEK IS A LIVE WEEK, AND IT IS NEVER "NO RECORD". A coach
 * assignment (migration 193) opens a week for a client of any tier on any
 * day, so two things change when one exists. The absent receipt becomes a
 * real fact rather than an unwatched one, because every assignment row
 * postdates the receipt system by construction: migration 193 ships after
 * migration 191, so there is no such thing as an assignment for a week
 * receipts were not being written in. And the sentence stays in the
 * present tense whatever the Friday-to-Sunday window is doing, because she
 * can still write it right now: a coach who assigned on Tuesday must not
 * read a past-tense line about last weekend.
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
 *
 * `assignedAt` only ever makes the answer MORE definite, never less. It
 * cannot turn a receipt into a non-delivery or a completion into anything
 * else. All it does is retire the "this week was not being watched"
 * escape, which cannot apply to a week a coach opened after receipts
 * existed.
 */
export function resolveReflectionDeliveryStatus(input: {
  weekStart: string;
  deliveredAt: string | null;
  completedAt: string | null;
  /** When a coach opened this week for her, or null. Any row here postdates the receipt system, so an absent receipt beside one is a real non-delivery. */
  assignedAt?: string | null | undefined;
  /** False when any underlying read failed. Never guess from an empty result. Omitted means "the reads worked". */
  readable?: boolean | undefined;
}): ReflectionDeliveryStatus {
  const { weekStart, deliveredAt, completedAt } = input;
  if (input.readable === false) return { kind: 'unreadable', weekStart };
  if (completedAt) return { kind: 'completed', weekStart, at: completedAt };
  if (deliveredAt) return { kind: 'delivered', weekStart, at: deliveredAt };
  if (!input.assignedAt && weekStart < DELIVERY_RECEIPTS_FIRST_WEEK) {
    return { kind: 'no_record', weekStart };
  }
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
 * TWO TENSES, ONE SET OF FACTS. When the week is still live the line is
 * about right now and needs no week named, because "this week" is the only
 * week it could be about. When it is over, the line names the week it is
 * reporting on, so a coach glancing at it on a Wednesday is never left
 * thinking it describes today.
 *
 * WHAT MAKES A WEEK LIVE IS EITHER OF THE TWO THINGS THAT OPEN IT. Her own
 * Friday-to-Sunday window, or a coach assignment for that week. An
 * assignment is exactly what makes a Tuesday a live day for this member,
 * so a past-tense line beside a button the coach pressed an hour ago would
 * be plainly wrong.
 *
 * AN ASSIGNED, UNDELIVERED WEEK SAYS WHO OPENED IT AND WHEN. "They have
 * not opened the app since Friday" is the automatic route's sentence and
 * is false for an assignment made on a Tuesday, so the assigned version
 * names the day it was sent instead.
 *
 * NO EM DASHES. Periods, commas, colons and parentheses.
 *
 * "They" rather than "she": this renders for every client on a coach's
 * caseload, and the panel beside it already says "them".
 */
export function reflectionStatusLine(
  status: ReflectionDeliveryStatus,
  options: {
    windowOpen: boolean;
    timeZone: string;
    /** When a coach opened this week for her, or null. A week with one is live whatever the window is doing. */
    assignedAt?: string | null | undefined;
  }
): string {
  const { windowOpen, timeZone } = options;
  const assignedAt = options.assignedAt ?? null;
  const live = windowOpen || assignedAt !== null;
  const week = formatWeekStart(status.weekStart);

  switch (status.kind) {
    case 'completed': {
      const day = reflectionDayName(status.at, timeZone);
      if (live) return day ? `Completed ${day}.` : 'Completed this week.';
      return day ? `Week of ${week}: completed ${day}.` : `Week of ${week}: completed.`;
    }
    case 'delivered': {
      const day = reflectionDayName(status.at, timeZone);
      if (live) {
        return day ? `Delivered ${day}. Not yet completed.` : 'Delivered this week. Not yet completed.';
      }
      return day
        ? `Week of ${week}: delivered ${day}, not completed.`
        : `Week of ${week}: delivered, not completed.`;
    }
    case 'not_delivered': {
      if (assignedAt) {
        const sent = reflectionDayName(assignedAt, timeZone);
        return sent
          ? `Assigned ${sent}. Not delivered yet, they have not opened the app since.`
          : 'Assigned this week. Not delivered yet.';
      }
      return windowOpen
        ? 'Not delivered yet. They have not opened the app since Friday.'
        : `Week of ${week}: not delivered. They did not open the app that weekend.`;
    }
    case 'no_record':
      return live
        ? 'No delivery record for this week.'
        : `Week of ${week}: no delivery record.`;
    case 'unreadable':
      return live
        ? 'The delivery record for this week could not be read.'
        : `Week of ${week}: the delivery record could not be read.`;
  }
}
