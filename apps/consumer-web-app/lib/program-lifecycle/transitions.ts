/**
 * Assignment lifecycle — the arithmetic, as pure functions with no I/O.
 *
 * Every rule about when a program starts, which week it is in, and when it
 * is over lives here and nowhere else, so the daily job, the coach's
 * manual pause/resume, the member's screen and the tests all read the same
 * one answer. Same "compute in app code over real config, not a database
 * trigger" convention as lib/coach-program-builder/scheduling.ts.
 *
 * Dates are plain YYYY-MM-DD strings throughout and are compared as UTC
 * midnights. A program's week boundary is a calendar day, not an instant,
 * so there is no clock and no timezone in this file at all — the caller
 * decides which day "today" is (the job uses the member's own local date)
 * and this file only does arithmetic on it.
 *
 * The one rule worth stating in words: PAUSING MUST NOT COST A MEMBER PART
 * OF HER PROGRAM. A program paused for ten days has ten days added to its
 * end date and ten days recorded in paused_days, and week arithmetic
 * subtracts paused_days from elapsed time. So four weeks of program is
 * always four weeks of program, however many times it was held.
 */

import type { ProgramAssignmentStatus } from '@mef/shared-types-contracts';

export const MS_PER_DAY = 86_400_000;

/** Default length of a program whose own configuration says nothing — a corrective phase is four weeks (lib/corrective-engine/review.ts assigns exactly that). */
export const DEFAULT_PROGRAM_DURATION_WEEKS = 4;

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  return toDateOnly(new Date(parseDateOnly(value).getTime() + days * MS_PER_DAY));
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / MS_PER_DAY);
}

/** The last day of a program, inclusive: whole weeks from the start, plus any days it spent paused. */
export function endDateFor(startDate: string, durationWeeks: number, pausedDays = 0): string {
  return addDays(startDate, durationWeeks * 7 - 1 + pausedDays);
}

/** The next date on or after `from` that falls on `dayOfWeek` (0 = Sunday). Returns `from` itself when it already matches. */
export function nextWeekdayOnOrAfter(from: string, dayOfWeek: number): string {
  const current = parseDateOnly(from).getUTCDay();
  const delta = (((dayOfWeek - current) % 7) + 7) % 7;
  return addDays(from, delta);
}

/** The minimal shape the lifecycle rules need. Anything with these fields — a database row, a test fixture — can be reasoned about. */
export interface LifecycleFacts {
  status: ProgramAssignmentStatus;
  start_date: string | null;
  end_date: string | null;
  duration_weeks: number | null;
  current_week: number | null;
  paused_days: number;
}

/**
 * Which week of the program `today` falls in, 1..duration_weeks. Days
 * spent paused do not count toward elapsed time, so a program held for a
 * fortnight resumes in the week it was held in, not two weeks later.
 * Clamped at both ends: before the start it is week 1, after the end it is
 * the final week.
 */
export function weekOn(facts: LifecycleFacts, today: string): number {
  if (!facts.start_date) return 1;
  const duration = facts.duration_weeks ?? DEFAULT_PROGRAM_DURATION_WEEKS;
  const elapsed = daysBetween(facts.start_date, today) - (facts.paused_days ?? 0);
  const week = Math.floor(elapsed / 7) + 1;
  return Math.min(duration, Math.max(1, week));
}

/** True once `today` is past the program's last day. A program with no end date can never expire by time. */
export function hasRunOut(facts: LifecycleFacts, today: string): boolean {
  if (!facts.end_date) return false;
  return daysBetween(facts.end_date, today) > 0;
}

export type LifecycleTransitionKind = 'started' | 'week_advanced' | 'completed';

export interface LifecycleTransition {
  kind: LifecycleTransitionKind;
  fromStatus: ProgramAssignmentStatus;
  toStatus: ProgramAssignmentStatus;
  /** The week the program is in after this transition. */
  week: number;
  durationWeeks: number;
}

/**
 * What the daily job should do to one assignment today, or null when the
 * answer is "nothing" — which is the answer on a second run of the same
 * day, and is what makes the job idempotent. There is no state carried
 * between runs: the decision is a function of the row's dates and today,
 * so re-running produces the same row, not a second transition.
 *
 * A paused program is deliberately inert. It does not advance a week and
 * it does not complete while it is being held, because a coach holding a
 * program is the one thing that should stop the clock. Terminal statuses
 * (completed, replaced, cancelled) are never revisited.
 */
export function planTransition(facts: LifecycleFacts, today: string): LifecycleTransition | null {
  const duration = facts.duration_weeks ?? DEFAULT_PROGRAM_DURATION_WEEKS;

  if (facts.status === 'upcoming') {
    if (!facts.start_date) return null;
    if (daysBetween(facts.start_date, today) < 0) return null;
    // A program whose whole span is already in the past starts and
    // finishes in one pass rather than being left mid-lifecycle; the job
    // reports it as completed, which is what it is.
    if (hasRunOut(facts, today)) {
      return {
        kind: 'completed',
        fromStatus: 'upcoming',
        toStatus: 'completed',
        week: duration,
        durationWeeks: duration,
      };
    }
    return {
      kind: 'started',
      fromStatus: 'upcoming',
      toStatus: 'active',
      week: weekOn(facts, today),
      durationWeeks: duration,
    };
  }

  if (facts.status === 'active') {
    if (hasRunOut(facts, today)) {
      return {
        kind: 'completed',
        fromStatus: 'active',
        toStatus: 'completed',
        week: duration,
        durationWeeks: duration,
      };
    }
    const week = weekOn(facts, today);
    if (week !== facts.current_week) {
      return {
        kind: 'week_advanced',
        fromStatus: 'active',
        toStatus: 'active',
        week,
        durationWeeks: duration,
      };
    }
    return null;
  }

  return null;
}

/**
 * The status a paused program returns to when a coach resumes it, given
 * its (already extended) dates. Almost always 'active'; 'upcoming' only
 * when it was paused before it ever started and its start date is still
 * ahead.
 */
export function resumedStatus(facts: LifecycleFacts, today: string): ProgramAssignmentStatus {
  if (facts.start_date && daysBetween(facts.start_date, today) < 0) return 'upcoming';
  return 'active';
}
