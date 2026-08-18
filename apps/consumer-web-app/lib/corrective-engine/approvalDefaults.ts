/**
 * What the Approve & Assign box is pre-filled with. Pure functions with no
 * I/O and no Supabase import, so the coach's review screen (a client
 * component) and the server that actually writes the assignment can both
 * read the same answer without the screen pulling a data layer into its
 * bundle.
 *
 * The rule these encode: in the common case the coach touches nothing.
 * The weekday pattern was already chosen for her (Mon/Thu for two sessions
 * a week, Mon/Wed/Fri for three); the start date is now the next of those
 * days rather than a hardcoded "next Monday", the duration comes from the
 * program itself, and the end date follows from the two. Every one of them
 * is still editable before she approves.
 */

import { addDays, endDateFor, nextWeekdayOnOrAfter } from '../program-lifecycle/transitions';

/** Mon/Thu or Mon/Wed/Fri — day-of-week indices (0=Sun..6=Sat) each weekly session is assigned to, spread across the week rather than back-to-back. */
export const WEEKLY_DAY_PATTERNS: Record<number, number[]> = {
  2: [1, 4],
  3: [1, 3, 5],
};

/** A corrective phase is four weeks. The number lives with the program that has it rather than as a constant scattered through the app, and a coach can change it before approving. */
export const CORRECTIVE_PROGRAM_DURATION_WEEKS = 4;

export function weeklyDayPatternFor(sessionCount: number): number[] {
  return (
    WEEKLY_DAY_PATTERNS[sessionCount] ??
    Array.from({ length: sessionCount }, (_, i) => 1 + ((i * 2) % 6))
  );
}

/**
 * The next day of the week the program's own pattern begins on. "Next"
 * means strictly after today: a program approved on a Monday starts the
 * following Monday, which leaves the member the rest of her week and the
 * coach a chance to look at it again.
 */
export function defaultCorrectiveStartDate(sessionCount: number, today: string): string {
  const firstDay = weeklyDayPatternFor(sessionCount)[0] ?? 1;
  return nextWeekdayOnOrAfter(addDays(today, 1), firstDay);
}

export interface CorrectiveApprovalDefaults {
  startDate: string;
  durationWeeks: number;
  endDate: string;
  /** 0 = Sunday. The days of the week her sessions land on. */
  daysOfWeek: number[];
}

export function correctiveApprovalDefaults(
  sessionCount: number,
  today: string
): CorrectiveApprovalDefaults {
  const startDate = defaultCorrectiveStartDate(sessionCount, today);
  const durationWeeks = CORRECTIVE_PROGRAM_DURATION_WEEKS;
  return {
    startDate,
    durationWeeks,
    endDate: endDateFor(startDate, durationWeeks),
    daysOfWeek: weeklyDayPatternFor(sessionCount),
  };
}
