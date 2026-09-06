/**
 * What is actually true about one coach assignment right now: whether it
 * reached her, and whether it is late.
 *
 * THE QUESTION THIS ANSWERS. An open row in assessment_assignments
 * (migration 77) says a coach decided to send something. On its own it
 * cannot tell "she has seen it and has not sat down to it" apart from "she
 * has not opened the app since it was sent and does not know it exists",
 * and it carried a due date nothing ever read, so "still open" and
 * "overdue" were the same sentence. Both gaps are closed here, from rows
 * that already exist plus one receipt (migration 210).
 *
 * IT IS THE WEEKLY REFLECTION'S PATTERN, DELIBERATELY. Every state name,
 * the precedence between them and the reason the fourth one exists are
 * lifted from lib/weekly-reflection/delivery.ts rather than reinvented, so
 * a coach reading a reflection line and an assignment line is reading one
 * vocabulary. The two differences are named where they occur: an
 * assignment can be cancelled, and an assignment can be late.
 *
 * PURE. No clock, no database, no timezone of its own. The rows, the
 * member's own today and the reading zone all arrive from the caller,
 * which is the server, which resolved them from her stored profile
 * timezone (lib/time/memberToday.ts).
 */

import { addDaysToLocalDate, daysBetweenLocalDates } from '../feed/dateMath';
import { localDateStringFor } from '../time/localDate';
import { formatDisplayDate, formatInTimeZone } from '../time/displayDate';

/** The three values assessment_assignments.status may hold (migration 77). */
export type AssignmentRowStatus = 'pending' | 'completed' | 'cancelled';

/**
 * The first instant this receipt system was live for.
 *
 * An assignment created before this could never have written a receipt, so
 * an absent receipt beside it proves nothing and must never be reported as
 * "they have not opened the app". This is the same escape
 * DELIVERY_RECEIPTS_FIRST_WEEK gives the Weekly Reflection, and it is
 * pinned to the midnight AFTER the build shipped (2026-09-05) rather than
 * to the deploy minute, because the honest direction is to claim less.
 *
 * A receipt that DOES exist is always believed, including against an
 * older assignment: the row could only have been written by a real
 * display.
 */
export const ASSIGNMENT_RECEIPTS_FIRST_INSTANT = '2026-09-06T00:00:00.000Z';

export type AssignmentDeliveryStatus =
  /** Finished. The strongest fact available, and it implies delivery. */
  | { kind: 'completed'; at: string | null }
  /** A coach withdrew it. Terminal, and never late. */
  | { kind: 'cancelled'; at: string | null }
  /** A receipt exists and the assignment is still open. */
  | { kind: 'delivered'; at: string }
  /** No receipt, on an assignment this system was watching from the moment it was made. */
  | { kind: 'not_delivered' }
  /** No receipt, on an assignment made before this system existed. */
  | { kind: 'no_record' }
  /** One of the reads failed. We know nothing, and say so. */
  | { kind: 'unreadable' };

/**
 * Whether it is late, and by how much.
 *
 * `isOverdue` is true for exactly one situation: a STILL OPEN assignment
 * carrying a due date whose calendar day is already behind the member's
 * own today. A completed one is not late, a cancelled one is not late, and
 * one with no due date cannot be late. Due TODAY is not late either: she
 * has the whole of the day her coach named.
 */
export type AssignmentDueState = {
  /** The calendar day it is due, YYYY-MM-DD, or null when no due date was set or the stored one will not parse. */
  dueDate: string | null;
  isOverdue: boolean;
  /** Whole days her own calendar is past the due day. Null unless isOverdue. */
  daysOverdue: number | null;
  /** Whole days until the due day, when it is still ahead. 0 means due today. Null when overdue, closed, or undated. */
  daysUntilDue: number | null;
};

export type AssignmentProgress = {
  /** When the coach sent it. Carried through so the sentence below can name the day without a second read. */
  assignedAt: string;
  delivery: AssignmentDeliveryStatus;
  due: AssignmentDueState;
};

/**
 * The calendar day a stored due_at names.
 *
 * WHY UTC, AND WHY THAT IS NOT A MISSING TIMEZONE. due_at is a timestamptz,
 * but every value the app writes into it is a bare calendar day: the coach
 * panel's `<input type="date">` posts YYYY-MM-DD and Postgres stores it as
 * that day's midnight UTC, and the Stress & Load default is written the
 * same way on purpose (app/actions/stressLoad.ts). Reading the day back in
 * UTC therefore returns the exact day the coach picked, in every reader's
 * zone. This is the identical rule formatDisplayDate states for a bare
 * date, and the identical zone the coach panel already formats due dates
 * in, so a chip and a comparison can never name different days.
 *
 * Null rather than a guess for anything that will not parse.
 */
export function assignmentDueDate(dueAt: string | null | undefined): string | null {
  if (!dueAt) return null;
  if (Number.isNaN(new Date(dueAt).getTime())) return null;
  return localDateStringFor(dueAt, 'UTC');
}

/**
 * The value to WRITE into assessment_assignments.due_at for a calendar
 * day, and the inverse of assignmentDueDate above.
 *
 * ONE CONVENTION FOR THE WHOLE LEDGER. The coach panel's
 * `<input type="date">` posts a bare YYYY-MM-DD and Postgres stores it as
 * that day's midnight UTC. Anything else that sets a due date writes the
 * same shape through here, so every row in the table can be read back as
 * the one calendar day it names, rather than one rule for a hand-picked
 * date and another for a computed one.
 */
export function dueAtForLocalDate(dueDate: string): string {
  return `${dueDate}T00:00:00.000Z`;
}

/**
 * The due_at for something assigned today and given `days` days.
 *
 * `memberToday` is HER calendar day, resolved on the server from her
 * stored timezone (lib/time/memberToday.ts), never the server's own. A
 * coach in California pressing an assign button at 6pm is already on
 * tomorrow's date in UTC, and a deadline that quietly lost a day is
 * exactly the class of bug that rule exists to end.
 */
export function dueAtInDays(memberToday: string, days: number): string {
  return dueAtForLocalDate(addDaysToLocalDate(memberToday, days));
}

/**
 * DERIVED AT READ TIME, NEVER STORED. There is no overdue column, no
 * background job and no scheduled sweep, because there is nothing here a
 * job would know that a read does not: the assignment's own status, its
 * stored due date and the member's own calendar day are all the inputs,
 * and two of the three are already on the row. A stored flag would be a
 * second source of truth for a number that can change while nobody is
 * looking, which is exactly the shape that goes stale.
 */
export function resolveAssignmentDueState(input: {
  status: AssignmentRowStatus;
  dueAt: string | null;
  /** The member's own local calendar day, YYYY-MM-DD, resolved on the server from her stored timezone. */
  memberToday: string;
}): AssignmentDueState {
  const dueDate = assignmentDueDate(input.dueAt);
  const closed = input.status !== 'pending';

  if (!dueDate || closed) {
    return { dueDate, isOverdue: false, daysOverdue: null, daysUntilDue: null };
  }

  const days = daysBetweenLocalDates(dueDate, input.memberToday);
  if (days > 0) return { dueDate, isOverdue: true, daysOverdue: days, daysUntilDue: null };
  // Math.abs rather than a negation, because negating zero gives -0, and
  // -0 is a value that reads as 0 everywhere except in an equality
  // assertion, which is exactly where it would surface as a mystery.
  return { dueDate, isOverdue: false, daysOverdue: null, daysUntilDue: Math.abs(days) };
}

/**
 * The one place the six delivery states are decided.
 *
 * PRECEDENCE, AND WHY IT IS THIS ORDER.
 *   unreadable first, because a failed read knows nothing and must never
 *     be dressed up as a fact either way.
 *   cancelled next, because a coach withdrawing something is the whole
 *     story of that row whatever else happened to it.
 *   completed next, because she cannot finish something that never reached
 *     her: a completion IS delivery, and reporting it as such is what
 *     keeps every assignment made before migration 210 readable rather
 *     than a wall of "no record".
 *   then the receipt, then the two ways of having none.
 *
 * `at` is allowed to be null on the two terminal states rather than
 * inventing a moment, exactly as the reflection's resolver refuses to
 * treat a completion with no timestamp as something to announce a day for.
 */
export function resolveAssignmentDeliveryStatus(input: {
  status: AssignmentRowStatus;
  /** When the coach made it. Decides whether an absent receipt is a fact or an unwatched gap. */
  createdAt: string;
  /** assessment_assignments.cancelled_at, when it was withdrawn. */
  cancelledAt?: string | null | undefined;
  /** assessment_assignments.updated_at, which migration 144's trigger stamps when it auto-closes a completion. */
  completedAt?: string | null | undefined;
  /** member_assignment_deliveries.delivered_at, or null when no receipt exists. */
  deliveredAt: string | null;
  /** False when any underlying read failed. Never guess from an empty result. Omitted means "the reads worked". */
  readable?: boolean | undefined;
}): AssignmentDeliveryStatus {
  if (input.readable === false) return { kind: 'unreadable' };
  if (input.status === 'cancelled') return { kind: 'cancelled', at: input.cancelledAt ?? null };
  if (input.status === 'completed') return { kind: 'completed', at: input.completedAt ?? null };
  if (input.deliveredAt) return { kind: 'delivered', at: input.deliveredAt };
  if (madeBeforeReceipts(input.createdAt)) return { kind: 'no_record' };
  return { kind: 'not_delivered' };
}

/**
 * Compared as instants, never as strings. Postgres hands back
 * `2026-09-05T14:20:00.123456+00:00`, and a lexicographic comparison
 * against a `Z` literal happens to work for that exact shape and stops
 * working the moment an offset or a different fractional precision shows
 * up. An unparseable created_at is treated as pre-receipt, which is the
 * direction that claims less.
 */
function madeBeforeReceipts(createdAt: string): boolean {
  const made = Date.parse(createdAt);
  if (Number.isNaN(made)) return true;
  return made < Date.parse(ASSIGNMENT_RECEIPTS_FIRST_INSTANT);
}

/** Both halves of one assignment's state, resolved together so no caller computes half of it. */
export function resolveAssignmentProgress(input: {
  status: AssignmentRowStatus;
  createdAt: string;
  dueAt: string | null;
  cancelledAt?: string | null | undefined;
  completedAt?: string | null | undefined;
  deliveredAt: string | null;
  memberToday: string;
  readable?: boolean | undefined;
}): AssignmentProgress {
  return {
    assignedAt: input.createdAt,
    delivery: resolveAssignmentDeliveryStatus(input),
    due: resolveAssignmentDueState(input),
  };
}

/**
 * The day an instant fell on, in the member's own zone, or null.
 *
 * Null rather than a sentinel string, so the sentence below can drop the
 * day instead of printing "date not available" in the middle of one. The
 * same helper reflectionDayName is, and for the same reason.
 */
function dayAndDate(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const text = formatInTimeZone(iso, { month: 'short', day: 'numeric' }, timeZone);
  return /^[A-Za-z]+ \d+$/.test(text) ? text : null;
}

/** "Sep 12", for naming a due day. A bare YYYY-MM-DD is a calendar day, so UTC is the zone that returns it unchanged. */
function dueDayText(dueDate: string): string {
  const text = formatDisplayDate(dueDate, { month: 'short', day: 'numeric' });
  return /^[A-Za-z]+ \d+$/.test(text) ? text : dueDate;
}

/**
 * The single sentence a coach reads beside one assignment.
 *
 * ONE STATEMENT, NOT TWO GLUED TOGETHER. Delivery and lateness are
 * separate facts, but a coach reads one line, so the late half is only
 * ever added to a sentence it can truthfully sit beside: a still open
 * assignment. A completed or cancelled one says so and stops.
 *
 * A STILL OPEN ONE NAMES THE DAY IT WAS SENT, for the reason the
 * reflection's assigned line names its own: "they have not seen it" means
 * something very different about something sent this morning than about
 * something sent nine days ago, and a coach should not have to hunt for
 * that on another row. A finished or withdrawn one does not, because the
 * day it ended is the only day that still matters.
 *
 * NO EM DASHES. Periods, commas, colons and parentheses.
 *
 * "They" rather than "she": this renders for every client on a coach's
 * caseload, matching the Weekly Reflection panel beside it.
 */
export function assignmentStatusLine(
  progress: AssignmentProgress,
  options: { timeZone: string }
): string {
  const { delivery, due } = progress;
  const { timeZone } = options;
  const sentDay = dayAndDate(progress.assignedAt, timeZone);
  const sent = sentDay ? `Sent ${sentDay}. ` : '';

  switch (delivery.kind) {
    case 'completed': {
      const day = dayAndDate(delivery.at, timeZone);
      return day ? `Completed ${day}.` : 'Completed.';
    }
    case 'cancelled': {
      const day = dayAndDate(delivery.at, timeZone);
      return day ? `Cancelled ${day}.` : 'Cancelled.';
    }
    case 'delivered': {
      const day = dayAndDate(delivery.at, timeZone);
      const seen = day ? `Seen ${day}, not completed.` : 'Seen, not completed.';
      return `${sent}${seen}${lateHalf(due)}`;
    }
    case 'not_delivered':
      return `${sent}Not seen yet, they have not opened a screen it appears on.${lateHalf(due)}`;
    case 'no_record':
      return `${sent}No delivery record for this one.${lateHalf(due)}`;
    case 'unreadable':
      return 'The delivery record for this one could not be read.';
  }
}

/** The lateness clause, or nothing at all. Never claims a deadline that was never set. */
function lateHalf(due: AssignmentDueState): string {
  if (!due.dueDate) return '';
  if (due.isOverdue) {
    const days = due.daysOverdue ?? 0;
    return ` Overdue since ${dueDayText(due.dueDate)} (${days} ${days === 1 ? 'day' : 'days'}).`;
  }
  if (due.daysUntilDue === 0) return ` Due today (${dueDayText(due.dueDate)}).`;
  return ` Due ${dueDayText(due.dueDate)}.`;
}
