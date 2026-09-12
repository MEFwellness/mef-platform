/**
 * What has already happened between this client and one instrument, as the
 * sentences the assign form prints above its fields.
 *
 * WHY IT IS PURE, AND WHY IT RETURNS SENTENCES RATHER THAN DATES. The
 * assign form is a client component. A client component that formatted
 * these days would format them in the COACH's timezone, and differently in
 * its two render passes, about days that belong to the MEMBER. So every
 * day here is resolved on the server in her stored zone, exactly as
 * assignmentStatusLine already resolves the one sentence beside each row,
 * and the form is handed finished text. The standing rule is
 * lib/time/memberToday.ts and this module keeps it.
 *
 * FOUR STATES, AND THE FORM DRAWS WHICHEVER ONE IS TRUE.
 *
 *   never assigned      no history at all. The form shows nothing extra
 *                       and behaves exactly as it did before this existed.
 *   open right now      the notice, and the confirm button says Resend,
 *                       because a client may never hold two open copies of
 *                       one instrument. The database enforces that too
 *                       (migration 144's partial unique index), so the
 *                       button is telling the truth about what the write
 *                       will do rather than making a promise of its own.
 *   completed recently  the same history lines plus one quiet line naming
 *                       how many days ago. No block, no warning colour, no
 *                       second confirm. The coach decides.
 *   completed before    the history lines alone.
 *
 * LAST COMPLETED IS THE MOST RECENT COMPLETION THIS CLIENT HAS, whichever
 * assignment it came from, not "the last assignment, if it happened to be
 * finished". A client sitting on a fresh copy today who finished the last
 * one in March has finished it: printing "Not completed" beside that open
 * copy would be a true sentence about one row and a false one about her.
 * "Not completed." is printed when she has never finished it at all.
 */

import { localDateStringFor } from '../time/localDate';
import { formatInTimeZone } from '../time/displayDate';
import { daysBetweenLocalDates } from '../feed/dateMath';
import { coachAssignCopy, fillCoachAssignTokens } from './copy';
import type { AssignmentRowStatus } from '../assignments/status';

/**
 * The minimum one assignment row has to carry for this file to read it.
 * Structural on purpose, so lib does not import a 'use server' module.
 */
export type AssignmentHistorySource = {
  id: string;
  assessmentDefinitionId: string;
  status: AssignmentRowStatus;
  /** When the coach sent it. */
  createdAt: string;
  /** Who sent it. auth.users.id, never a name: a name is looked up under RLS by the caller. */
  assignedBy: string;
  /** When migration 144's trigger closed it out. Null on anything not completed. */
  completedAt: string | null;
};

/** The finished lines one assign form prints. Every one of them is already text. */
export type AssignmentHistoryView = {
  /** The small heading over the lines. */
  heading: string;
  /** "Last assigned Sep 12, by you." Null only if the day will not parse. */
  lastAssignedLine: string | null;
  /** "Last completed Sep 10." or "Not completed." Never null once there is any history. */
  lastCompletedLine: string;
  /** "This is already waiting for Ebony, sent Sep 12." Null when nothing is open. */
  openNoticeLine: string | null;
  /** "Completed 3 days ago." Null unless the last completion is inside the recent window. */
  recentCompletionLine: string | null;
  /** True when an assignment is open right now, which is what makes the confirm button read Resend. */
  isOpen: boolean;
  /** The open assignment's id, for the resend write. Null when nothing is open. */
  openAssignmentId: string | null;
};

/** How recent a finish has to be for the quiet line to appear. */
export const RECENT_COMPLETION_DAYS = 14;

/** "Sep 12", in the member's own zone, or null when the instant will not parse. */
function dayText(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const text = formatInTimeZone(iso, { month: 'short', day: 'numeric' }, timeZone);
  return /^[A-Za-z]+ \d+$/.test(text) ? text : null;
}

/** The newest row of a set, by the day the coach sent it. The caller's order is not trusted. */
function newestBy<T>(rows: T[], instantOf: (row: T) => string): T | null {
  let best: T | null = null;
  let bestAt = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const at = Date.parse(instantOf(row));
    if (Number.isNaN(at)) continue;
    if (at > bestAt) {
      best = row;
      bestAt = at;
    }
  }
  return best;
}

/**
 * How many of HER calendar days have passed since a completion, or null
 * when the instant will not parse.
 *
 * Her zone, and her today, for the reason every date in this app is
 * resolved that way: a member in Auckland finished something "yesterday"
 * on a day that is still today for her coach in California.
 */
export function daysSinceCompletion(input: {
  completedAt: string;
  timeZone: string;
  memberToday: string;
}): number | null {
  if (Number.isNaN(Date.parse(input.completedAt))) return null;
  const day = localDateStringFor(input.completedAt, input.timeZone);
  const days = daysBetweenLocalDates(day, input.memberToday);
  return days < 0 ? 0 : days;
}

/** The quiet line, or null when the finish is older than the window. */
function recentCompletionLine(input: {
  days: number | null;
  copy: Record<string, string>;
  recentDays: number;
}): string | null {
  const { days, copy } = input;
  if (days === null || days > input.recentDays) return null;
  if (days === 0) return coachAssignCopy(copy, 'assign.completed_today');
  if (days === 1) return coachAssignCopy(copy, 'assign.completed_one_day_ago');
  return fillCoachAssignTokens(coachAssignCopy(copy, 'assign.completed_days_ago'), { days });
}

/**
 * One instrument's history for one client, or null when it has never been
 * sent to her.
 *
 * NULL IS THE POINT of the never-assigned case: the form is asked to draw
 * nothing extra rather than to draw a block of empty lines, so a client
 * nobody has sent anything to sees the form exactly as it was.
 */
export function buildAssignmentHistory(input: {
  assignments: readonly AssignmentHistorySource[];
  definitionId: string;
  copy: Record<string, string>;
  timeZone: string;
  /** HER calendar day, resolved on the server from her stored timezone. */
  memberToday: string;
  /** What the open notice calls her. The first word of her display name. */
  clientFirstName: string;
  /** The coach reading the form, so "by you" is only ever said to the person it is true about. */
  viewerId: string;
  /** auth user id to display name, for the coaches this reader is allowed to see. */
  assignerNames: Record<string, string>;
  recentDays?: number;
}): AssignmentHistoryView | null {
  const mine = input.assignments.filter(
    (row) => row.assessmentDefinitionId === input.definitionId && row.status !== 'cancelled'
  );
  if (mine.length === 0) return null;

  const { copy, timeZone } = input;
  const recentDays = input.recentDays ?? RECENT_COMPLETION_DAYS;

  const lastAssigned = newestBy(mine, (row) => row.createdAt);
  const open = mine.find((row) => row.status === 'pending') ?? null;
  const lastCompleted = newestBy(
    mine.filter((row) => row.status === 'completed' && row.completedAt !== null),
    (row) => row.completedAt as string
  );

  const assignedDay = lastAssigned ? dayText(lastAssigned.createdAt, timeZone) : null;
  /*
    WHO SENT IT, AND WHAT IS SAID WHEN WE CANNOT NAME THEM.

    "by you" only to the person it is true about. Another coach's name only
    when profiles let this reader read it, which for a plain coach means
    their own row and their own clients' (migration 16). When it cannot be
    read the sentence still says the useful half, that somebody else sent
    it, in the stored words rather than in a guess at a name.
  */
  const author = lastAssigned
    ? lastAssigned.assignedBy === input.viewerId
      ? coachAssignCopy(copy, 'assign.by_you')
      : (input.assignerNames[lastAssigned.assignedBy] ??
        coachAssignCopy(copy, 'assign.by_unknown'))
    : null;

  const lastAssignedLine =
    assignedDay && author
      ? fillCoachAssignTokens(coachAssignCopy(copy, 'assign.last_assigned'), {
          date: assignedDay,
          by: author,
        })
      : null;

  const completedDay = lastCompleted ? dayText(lastCompleted.completedAt, timeZone) : null;
  const lastCompletedLine = completedDay
    ? fillCoachAssignTokens(coachAssignCopy(copy, 'assign.last_completed'), { date: completedDay })
    : coachAssignCopy(copy, 'assign.not_completed');

  /*
    THE NOTICE NAMES THE DAY OR IT IS NOT DRAWN.

    An assignment row's created_at is a not null timestamptz, so a day that
    will not parse is a theoretical state rather than a real one. It is
    still handled the way every other day in this app is: the sentence is
    dropped rather than printed with a hole in it. `isOpen` is set either
    way, because that is the half that decides what the button writes, and
    a coach must never be offered Assign on something already open.
  */
  const openDay = open ? dayText(open.createdAt, timeZone) : null;
  const openNoticeLine =
    open && openDay
      ? fillCoachAssignTokens(coachAssignCopy(copy, 'assign.open_notice'), {
          name: input.clientFirstName,
          date: openDay,
        })
      : null;

  const sinceCompletion = lastCompleted?.completedAt
    ? daysSinceCompletion({
        completedAt: lastCompleted.completedAt,
        timeZone,
        memberToday: input.memberToday,
      })
    : null;

  return {
    heading: coachAssignCopy(copy, 'assign.history_heading'),
    lastAssignedLine,
    lastCompletedLine,
    openNoticeLine,
    recentCompletionLine: recentCompletionLine({ days: sinceCompletion, copy, recentDays }),
    isOpen: open !== null,
    openAssignmentId: open?.id ?? null,
  };
}

/** The same, for every instrument named, keyed by definition id. */
export function buildAssignmentHistories(
  input: Omit<Parameters<typeof buildAssignmentHistory>[0], 'definitionId'> & {
    definitionIds: readonly string[];
  }
): Record<string, AssignmentHistoryView> {
  const out: Record<string, AssignmentHistoryView> = {};
  for (const definitionId of input.definitionIds) {
    const view = buildAssignmentHistory({ ...input, definitionId });
    if (view) out[definitionId] = view;
  }
  return out;
}

/** Her first name, for the open notice. The whole name when it is one word, and a fallback when it is empty. */
export function firstNameOf(displayName: string | null | undefined, fallback = 'them'): string {
  const trimmed = (displayName ?? '').trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.split(/\s+/)[0] ?? fallback;
}
