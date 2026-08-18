/**
 * What a member sees about the program she is on: where she is in it, when
 * it runs, and what happened to the ones that came before.
 *
 * Pure functions over rows that were already fetched. Grouping matters
 * here, because a corrective program is delivered as one assignment per
 * weekly session and a member is on ONE program, not two or three: without
 * grouping she would read "Week 2 of 4" three times over. Assignments that
 * belong to one program share a program_group_key (migration 172).
 *
 * All copy in this file is warm and plain, uses no em dashes, and never
 * states a clinical fact. It says where she is; it does not diagnose.
 */

import type {
  CoachAssignedWorkout,
  MemberProgramLifecycle,
  ProgramAssignmentStatus,
} from '@mef/shared-types-contracts';

export interface MemberProgramView {
  groupKey: string;
  /** The program's name, with the ": Session A" suffix removed when its sessions share one. */
  name: string;
  status: ProgramAssignmentStatus;
  startDate: string | null;
  endDate: string | null;
  currentWeek: number | null;
  durationWeeks: number | null;
  assignmentIds: string[];
  workouts: CoachAssignedWorkout[];
  totalWorkouts: number;
  completedWorkouts: number;
  completionPercent: number;
  /** The one line that says where she is. */
  headline: string;
  /** The supporting line, or null when the headline says it all. */
  detail: string | null;
}

/** Ranked so the program she is on sorts above one that has not started, above her history. */
const STATUS_ORDER: Record<ProgramAssignmentStatus, number> = {
  active: 0,
  paused: 1,
  upcoming: 2,
  completed: 3,
  replaced: 4,
  cancelled: 5,
};

export function isCurrentProgramStatus(status: ProgramAssignmentStatus): boolean {
  return status === 'active' || status === 'paused' || status === 'upcoming';
}

export function formatProgramDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

export function formatProgramDateWithWeekday(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * "Corrective: Lower Cross: Session A" and "...: Session B" are one
 * program, so the shared part is its name. A single-assignment program
 * keeps its own name unchanged.
 */
export function programDisplayName(names: string[]): string {
  const stripped = names.map((name) => name.replace(/:\s*Session\s+[A-Z]$/, '').trim());
  const first = stripped[0] ?? '';
  if (stripped.every((name) => name === first) && first.length > 0) return first;
  return names[0] ?? 'Your program';
}

/** The line she reads first. Plain language, present tense, no jargon and no em dashes. */
export function programHeadline(view: {
  status: ProgramAssignmentStatus;
  currentWeek: number | null;
  durationWeeks: number | null;
  startDate: string | null;
}): string {
  switch (view.status) {
    case 'active':
      return view.currentWeek && view.durationWeeks
        ? `Week ${view.currentWeek} of ${view.durationWeeks}`
        : 'In progress';
    case 'upcoming':
      return view.startDate ? `Starts ${formatProgramDateWithWeekday(view.startDate)}` : 'Starting soon';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Program complete';
    case 'replaced':
      return 'Replaced by a newer program';
    case 'cancelled':
      return 'Stopped by your coach';
  }
}

/** The second line. Says the dates for a running program, and for a finished one says what happens next, so the end of a program never reads like an ending. */
export function programDetail(view: {
  status: ProgramAssignmentStatus;
  startDate: string | null;
  endDate: string | null;
  completedWorkouts: number;
  totalWorkouts: number;
}): string | null {
  const range =
    view.startDate && view.endDate
      ? `${formatProgramDate(view.startDate)} to ${formatProgramDate(view.endDate)}`
      : null;

  switch (view.status) {
    case 'active':
      return range;
    case 'upcoming':
      return view.endDate && view.startDate ? `Runs ${range}.` : null;
    case 'paused':
      return 'Your coach has put this on hold. It will pick up where you left off.';
    case 'completed':
      return `Your coach is reviewing your next phase. You finished ${view.completedWorkouts} of ${view.totalWorkouts} sessions.`;
    case 'replaced':
      return range ? `You did ${view.completedWorkouts} of ${view.totalWorkouts} sessions, ${range}.` : null;
    case 'cancelled':
      return range;
  }
}

/**
 * One view per program, newest and most current first. Workouts are matched
 * to their program through assignment_id, so a workout can never be
 * attributed to a program it did not come from.
 */
export function buildMemberProgramViews(
  lifecycles: MemberProgramLifecycle[],
  workouts: CoachAssignedWorkout[]
): MemberProgramView[] {
  const byGroup = new Map<string, MemberProgramLifecycle[]>();
  for (const row of lifecycles) {
    const key = row.program_group_key ?? row.id;
    const list = byGroup.get(key) ?? [];
    list.push(row);
    byGroup.set(key, list);
  }

  const views: MemberProgramView[] = [];
  for (const [groupKey, rows] of byGroup) {
    const assignmentIds = rows.map((r) => r.id);
    const groupWorkouts = workouts
      .filter((w) => assignmentIds.includes(w.assignment_id))
      .slice()
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

    // One program, one status. Where its sessions somehow disagree (a
    // partly applied job, a coach pausing one row), the least advanced
    // live status wins, so she is never told a program is over while part
    // of it is still running.
    const status = rows
      .map((r) => r.status)
      .sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b])[0]!;

    const primary = rows.find((r) => r.status === status) ?? rows[0]!;
    const completedWorkouts = groupWorkouts.filter((w) => w.status === 'completed').length;
    const totalWorkouts = groupWorkouts.length;

    // The program's span is the span of the whole group, not of whichever
    // session happens to be listed first: it starts on the earliest of its
    // sessions' start dates and runs to the latest of their end dates. The
    // rows normally agree (migrations 172 and 173, and every approval since
    // passes one shared start date), but a member must never be told she is
    // in a different week depending on which session she opened, so the
    // grouping decides rather than assuming.
    const startDates = rows.map((r) => r.start_date).filter((d): d is string => d !== null);
    const endDates = rows.map((r) => r.end_date).filter((d): d is string => d !== null);
    const currentWeeks = rows.map((r) => r.current_week).filter((w): w is number => w !== null);

    const base = {
      status,
      startDate: startDates.length > 0 ? startDates.slice().sort()[0]! : null,
      endDate: endDates.length > 0 ? endDates.slice().sort().at(-1)! : null,
      currentWeek: currentWeeks.length > 0 ? Math.max(...currentWeeks) : primary.current_week,
      durationWeeks: Math.max(...rows.map((r) => r.duration_weeks ?? 0)) || primary.duration_weeks,
      completedWorkouts,
      totalWorkouts,
    };

    views.push({
      groupKey,
      name: programDisplayName(rows.map((r) => r.template_name_snapshot)),
      ...base,
      assignmentIds,
      workouts: groupWorkouts,
      completionPercent:
        totalWorkouts > 0 ? Math.round((completedWorkouts / totalWorkouts) * 100) : 0,
      headline: programHeadline(base),
      detail: programDetail(base),
    });
  }

  return views.sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    return (b.startDate ?? '').localeCompare(a.startDate ?? '');
  });
}
