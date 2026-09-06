/**
 * The band's six rows, as words.
 *
 * PURE. No clock, no database, no timezone of its own. Every input arrives
 * already read and already resolved by the system that owns it, which is
 * what keeps this file a rendering of other people's answers rather than a
 * seventh opinion about the same member.
 *
 * THREE RULES THIS FILE EXISTS TO KEEP.
 *
 * 1. "MISSED" NEVER APPEARS. Not for a Daily Reset, not for a Reset Plan
 *    day, not for a workout. A day with no row is not evidence of a
 *    decision she made: the app cannot tell "she chose not to" from "she
 *    never opened the screen", and a coach who reads "missed" will say
 *    "missed" to her. Where a real deadline has actually passed, the words
 *    are "not completed" plus the day it was due, which the assignment
 *    ledger already writes.
 *
 * 2. A COUNT NAMES ITS WINDOW. Every counted claim here either says "of 7
 *    days" or is printed under the band's own "Week of Aug 29 to Sep 4"
 *    heading. The Reset Plan is the one row counted over a different span
 *    and it names that span in its own sentence ("since day one"), because
 *    a plan's adherence is about the plan and not about this week.
 *
 * 3. A STATE THAT CANNOT BE TOLD APART IS SAID TO BE. A scheduled session
 *    still sitting at not_started could be one she decided against or one
 *    she never opened, and the row says exactly that rather than picking.
 *
 * NO EM DASHES. Commas, periods, colons and parentheses.
 */

import type { AssignedWorkoutStatus } from '@mef/shared-types-contracts';
import { EXPERIMENT_OUTCOME_LABEL } from '../lifestyle-experiments/copy';
import type { LifestyleExperiment } from '../lifestyle-experiments/types';
import type { ResetPlanDailyState } from '../reset-plan/constants';
import type { ThisWeekDetail, ThisWeekRow } from './types';

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

// ---------------------------------------------------------------------
// 1. Check-ins.
// ---------------------------------------------------------------------

/**
 * "Checked in on 3 of 7 days."
 *
 * The count is `countLoggedDays` over `listCheckinDatesForRecap`, which is
 * the recap's own reader and the one file that owns the count
 * (lib/member-counts/checkinCounts.ts). Deliberately no per-day tick grid:
 * a grid of seven boxes with four of them empty is a claim about four days
 * that nothing in the database supports.
 */
export function checkinRow(checkinCount: number): ThisWeekRow {
  return {
    key: 'checkins',
    label: 'Daily Reset',
    statement: `Checked in on ${checkinCount} of 7 days.`,
    details: [],
  };
}

// ---------------------------------------------------------------------
// 2. Weekly Reflection.
// ---------------------------------------------------------------------

/**
 * The reflection's own status sentence, verbatim.
 *
 * Written by lib/weekly-reflection/delivery.ts on the server, in HER
 * timezone, and not re-worded here. That module already draws the
 * distinction this row exists for: completed, delivered but not completed,
 * and not delivered, plus the two honest states for "we were not watching"
 * and "the read failed".
 */
export function reflectionRow(statusLine: string | null): ThisWeekRow {
  return {
    key: 'weekly_reflection',
    label: 'Weekly Reflection',
    statement:
      statusLine ?? 'Nothing opened for her this week, so there is no delivery to report.',
    details: [],
  };
}

// ---------------------------------------------------------------------
// 3. Programs and workouts.
// ---------------------------------------------------------------------

/**
 * How each stored workout status reads on a coach's screen.
 *
 * Exhaustive by type, so a new status added to the program builder is a
 * compile error here rather than a session quietly missing from the count.
 *
 * `stopped` is NEVER rendered as a skip. Migration 177 made it a separate
 * status precisely because "not today" and "this hurt and I am not doing
 * it until my coach has looked at it" are different facts, and collapsing
 * them is how a pain report becomes an adherence problem.
 *
 * `skipped` is her own explicit tap, so it is reported as her decision and
 * not as an absence.
 *
 * `not_started` is the one that cannot be told apart, and says so.
 */
const WORKOUT_STATUS_TEXT: Record<AssignedWorkoutStatus, (n: number) => string> = {
  completed: (n) => `${n} completed.`,
  partially_completed: (n) => `${n} partly completed.`,
  in_progress: (n) => `${n} started and not finished.`,
  stopped: (n) =>
    `${n} stopped after she reported pain or discomfort. That is not a skip, and it is waiting on you.`,
  skipped: (n) => `${n} she marked as not today.`,
  not_started: (n) =>
    `${n} still not started. There is no record of whether she opened ${plural(n, 'it', 'them')}, so this is not a skip either.`,
};

/** The order the lines are read in: what happened, then what did not, then what is unknown. */
const WORKOUT_STATUS_ORDER: AssignedWorkoutStatus[] = [
  'completed',
  'partially_completed',
  'in_progress',
  'stopped',
  'skipped',
  'not_started',
];

export function programRow(
  workoutsInWindow: ReadonlyArray<{ status: AssignedWorkoutStatus }>
): ThisWeekRow {
  const total = workoutsInWindow.length;
  if (total === 0) {
    return {
      key: 'programs',
      label: 'Programs and workouts',
      statement: 'No sessions were scheduled in these 7 days.',
      details: [],
    };
  }

  const counts = new Map<AssignedWorkoutStatus, number>();
  for (const workout of workoutsInWindow) {
    counts.set(workout.status, (counts.get(workout.status) ?? 0) + 1);
  }

  const details: ThisWeekDetail[] = [];
  for (const status of WORKOUT_STATUS_ORDER) {
    const count = counts.get(status);
    if (count) details.push({ text: WORKOUT_STATUS_TEXT[status](count) });
  }

  return {
    key: 'programs',
    label: 'Programs and workouts',
    statement: `${total} ${plural(total, 'session', 'sessions')} scheduled in these 7 days.`,
    details,
  };
}

// ---------------------------------------------------------------------
// 4. Lifestyle Experiments.
// ---------------------------------------------------------------------

export type ExperimentForBand = Pick<
  LifestyleExperiment,
  'title' | 'status' | 'outcome' | 'startDate' | 'durationDays'
>;

/**
 * Running, finished with an outcome, or past its end with no reflection.
 *
 * The status handed in is the experiments feature's OWN effective status:
 * `deriveEffectiveStatus` in lib/lifestyle-experiments/lifecycle.ts turns
 * an 'active' row that is past its start date plus its duration into
 * 'expired_no_reflection' at read time. Nothing is re-derived here, and
 * the word "overdue" is not used for it, because the thing that has run
 * out is the tracking period rather than a deadline somebody set her.
 */
export function experimentRow(experiments: readonly ExperimentForBand[]): ThisWeekRow {
  const running = experiments.filter((e) => e.status === 'active');
  const finished = experiments.filter((e) => e.status === 'completed');
  const expired = experiments.filter((e) => e.status === 'expired_no_reflection');
  const stopped = experiments.filter((e) => e.status === 'abandoned');

  const details: ThisWeekDetail[] = [];
  for (const experiment of running) {
    details.push({ text: `${experiment.title}: running (${experiment.durationDays} days from ${experiment.startDate}).` });
  }
  for (const experiment of finished) {
    const outcome = experiment.outcome ? EXPERIMENT_OUTCOME_LABEL[experiment.outcome] : null;
    details.push({
      text: outcome
        ? `${experiment.title}: finished, and she said ${outcome.toLowerCase()}.`
        : `${experiment.title}: finished, with no outcome recorded.`,
    });
  }
  for (const experiment of expired) {
    details.push({
      text: `${experiment.title}: past its end date with no reflection written yet.`,
    });
  }
  for (const experiment of stopped) {
    details.push({ text: `${experiment.title}: she stopped it early.` });
  }

  const parts: string[] = [];
  if (running.length > 0) parts.push(`${running.length} running`);
  if (finished.length > 0) parts.push(`${finished.length} finished in these 7 days`);
  if (expired.length > 0) parts.push(`${expired.length} past its end with no reflection`);
  if (stopped.length > 0) parts.push(`${stopped.length} stopped early in these 7 days`);

  return {
    key: 'experiments',
    label: 'Lifestyle Experiments',
    statement:
      parts.length === 0
        ? 'None running, and none finished in these 7 days.'
        : `${parts.join(', ')}.`,
    details,
  };
}

// ---------------------------------------------------------------------
// 5. Personal Reset Plan.
// ---------------------------------------------------------------------

export type ResetPlanForBand = {
  /** The member's own local date the plan went active. Null until it is activated. */
  startLocalDate: string | null;
  /** Every daily log row on the plan. A row whose state is null was never a tapped state. */
  logs: ReadonlyArray<{ state: ResetPlanDailyState | null }>;
};

/** The three explicit states, and only these three, exactly as the member's own card and the coach's Reset Plan panel name them. */
const RESET_STATE_LABEL: Record<ResetPlanDailyState, string> = {
  completed_normal: 'normal',
  completed_difficult: 'difficult day',
  not_today: 'not today',
};

const RESET_STATE_ORDER: ResetPlanDailyState[] = [
  'completed_normal',
  'completed_difficult',
  'not_today',
];

/**
 * "Logged on 5 days since day one (Aug 20)."
 *
 * COUNTED OVER THE PLAN, NOT OVER THIS WEEK, and the sentence says so. A
 * Reset Plan is a plan she started on a particular day, and its adherence
 * is about that plan; squeezing it into the band's seven days would make
 * "1 of 7" read as a failure on a plan she started on Thursday.
 *
 * A DAY WITH NO ROW IS NOT COUNTED AS ANYTHING. Only the three explicit
 * tapped states are counted, a row carrying only a day-3 answer is not a
 * logged day, and the difference between the plan's elapsed days and the
 * logged ones is never named as a miss.
 */
export function resetPlanRow(plan: ResetPlanForBand | null): ThisWeekRow {
  if (!plan) {
    return {
      key: 'reset_plan',
      label: 'Personal Reset Plan',
      statement: 'She has not started one.',
      details: [],
    };
  }

  if (!plan.startLocalDate) {
    return {
      key: 'reset_plan',
      label: 'Personal Reset Plan',
      statement: 'Built but not activated yet, so there is no day one to count from.',
      details: [],
    };
  }

  const explicit = plan.logs.filter(
    (log): log is { state: ResetPlanDailyState } => log.state !== null
  );
  const counts = new Map<ResetPlanDailyState, number>();
  for (const log of explicit) counts.set(log.state, (counts.get(log.state) ?? 0) + 1);

  const breakdown = RESET_STATE_ORDER.filter((state) => counts.get(state))
    .map((state) => `${counts.get(state)} ${RESET_STATE_LABEL[state]}`)
    .join(', ');

  return {
    key: 'reset_plan',
    label: 'Personal Reset Plan',
    statement: `Logged on ${explicit.length} ${plural(explicit.length, 'day', 'days')} since day one (${plan.startLocalDate}).`,
    details: breakdown ? [{ text: `${breakdown}.` }] : [],
  };
}

// ---------------------------------------------------------------------
// 6. Assigned assessments and deep-dives.
// ---------------------------------------------------------------------

export type AssignmentForBand = {
  id: string;
  /** The assessment's registered display name, or a plain fallback. Never a database id. */
  name: string;
  /** The sentence lib/assignments/status.ts already writes, in her timezone. */
  statusLine: string;
  /** Still open. Shown whatever week it was sent in, because open work is open. */
  open: boolean;
  /** True only for a still open assignment whose stored due day is already behind her own today. */
  overdue: boolean;
};

/**
 * Open assignments, plus the ones that closed inside the window.
 *
 * THE SENTENCE IS THE LEDGER'S, NOT THIS FILE'S. `assignmentStatusLine`
 * already says sent, seen, not completed, due and overdue, and already
 * refuses to name a deadline on a completed or cancelled row. Rewriting it
 * here would be a second vocabulary for one fact.
 *
 * OPEN WORK IS NOT WINDOWED, and the row says so. An assignment sent three
 * weeks ago and still not seen is the most useful line on this band, and
 * dropping it because it was not sent in these seven days would hide
 * exactly the case the receipt was built for.
 */
export function assignmentRow(input: {
  open: readonly AssignmentForBand[];
  closedInWindow: readonly AssignmentForBand[];
}): ThisWeekRow {
  const details: ThisWeekDetail[] = [
    ...input.open.map((assignment) => ({
      text: `${assignment.name}: ${assignment.statusLine}`,
      overdue: assignment.overdue,
    })),
    ...input.closedInWindow.map((assignment) => ({
      text: `${assignment.name}: ${assignment.statusLine}`,
    })),
  ];

  const parts: string[] = [];
  if (input.open.length > 0) {
    const late = input.open.filter((a) => a.overdue).length;
    parts.push(
      late > 0
        ? `${input.open.length} still open (${late} past the day it was due)`
        : `${input.open.length} still open`
    );
  }
  if (input.closedInWindow.length > 0) {
    parts.push(`${input.closedInWindow.length} closed in these 7 days`);
  }

  return {
    key: 'assignments',
    label: 'Assigned assessments and deep-dives',
    statement:
      parts.length === 0
        ? 'Nothing is open, and nothing closed in these 7 days.'
        : `${parts.join(', ')}. Open ones are counted whatever week they were sent in.`,
    details,
  };
}
