/**
 * A coach's view of one client's programs, grouped the same way the
 * member's is: one entry per PROGRAM, not one per assignment.
 *
 * The live run of scripts/verify-program-lifecycle-live.mjs found why this
 * has to exist. A corrective program is delivered as two or three
 * assignments (one per weekly session), the coach screen listed all three,
 * and Pause on one of them paused one third of a program: the coach's
 * screen then said "Paused" while the member's screen, correctly, still
 * said the program was running. One program, one row, one set of controls.
 *
 * Pure functions over summaries that were already fetched, same shape and
 * same grouping key as lib/program-lifecycle/memberView.ts.
 */

import type { ProgramAssignmentStatus, ProgramAssignmentSummary } from '@mef/shared-types-contracts';
import { programDisplayName } from './memberView';

/** Ranked so the program the client is on sorts above one that has not started, above history. */
const STATUS_ORDER: Record<ProgramAssignmentStatus, number> = {
  active: 0,
  paused: 1,
  upcoming: 2,
  completed: 3,
  replaced: 4,
  cancelled: 5,
};

export interface CoachProgramGroup {
  groupKey: string;
  name: string;
  status: ProgramAssignmentStatus;
  /** True while any assignment in the program is still an unpublished draft. */
  hasDraft: boolean;
  startDate: string | null;
  endDate: string | null;
  currentWeek: number | null;
  durationWeeks: number | null;
  totalWorkouts: number;
  completedWorkouts: number;
  completionPercent: number;
  lastCompletedAt: string | null;
  nextScheduledDate: string | null;
  /** One per weekly session, in name order. Every lifecycle control acts on all of them at once. */
  sessions: ProgramAssignmentSummary[];
}

export function isLiveProgramStatus(status: ProgramAssignmentStatus): boolean {
  return status === 'active' || status === 'paused' || status === 'upcoming';
}

export function buildCoachProgramGroups(
  summaries: ProgramAssignmentSummary[]
): CoachProgramGroup[] {
  const byGroup = new Map<string, ProgramAssignmentSummary[]>();
  for (const summary of summaries) {
    const key = summary.assignment.program_group_key ?? summary.assignment.id;
    const list = byGroup.get(key) ?? [];
    list.push(summary);
    byGroup.set(key, list);
  }

  const groups: CoachProgramGroup[] = [];
  for (const [groupKey, sessions] of byGroup) {
    const ordered = sessions
      .slice()
      .sort((a, b) =>
        a.assignment.template_name_snapshot.localeCompare(b.assignment.template_name_snapshot)
      );
    const assignments = ordered.map((s) => s.assignment);

    const status = assignments
      .map((a) => a.status)
      .sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b])[0]!;

    const startDates = assignments.map((a) => a.start_date).filter((d): d is string => d !== null);
    const endDates = assignments.map((a) => a.end_date).filter((d): d is string => d !== null);
    const weeks = assignments.map((a) => a.current_week).filter((w): w is number => w !== null);
    const durations = assignments.map((a) => a.duration_weeks).filter((w): w is number => w !== null);

    const totalWorkouts = ordered.reduce((sum, s) => sum + s.totalWorkouts, 0);
    const completedWorkouts = ordered.reduce((sum, s) => sum + s.completedWorkouts, 0);
    const lastCompletedAt = ordered
      .map((s) => s.lastCompletedAt)
      .filter((d): d is string => d !== null)
      .sort()
      .at(-1) ?? null;
    const nextScheduledDate = ordered
      .map((s) => s.nextScheduledDate)
      .filter((d): d is string => d !== null)
      .sort()[0] ?? null;

    groups.push({
      groupKey,
      name: programDisplayName(assignments.map((a) => a.template_name_snapshot)),
      status,
      hasDraft: assignments.some((a) => a.visibility === 'draft'),
      startDate: startDates.length > 0 ? startDates.slice().sort()[0]! : null,
      endDate: endDates.length > 0 ? endDates.slice().sort().at(-1)! : null,
      currentWeek: weeks.length > 0 ? Math.max(...weeks) : null,
      durationWeeks: durations.length > 0 ? Math.max(...durations) : null,
      totalWorkouts,
      completedWorkouts,
      completionPercent:
        totalWorkouts > 0 ? Math.round((completedWorkouts / totalWorkouts) * 100) : 0,
      lastCompletedAt,
      nextScheduledDate,
      sessions: ordered,
    });
  }

  return groups.sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    return (b.startDate ?? '').localeCompare(a.startDate ?? '');
  });
}
