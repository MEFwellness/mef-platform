'use client';

/**
 * A coach's view of one client's programs: one card per PROGRAM, split by
 * what is true right now. The program she is on (at most one, since
 * assigning a new one supersedes the old one with lineage), anything
 * upcoming or paused, and then history with dates and completion rates.
 *
 * One card per program, not per assignment. A corrective program is
 * delivered as two or three weekly-session assignments; listing all of
 * them separately made Pause act on a third of a program, which is not a
 * state this product has. The sessions are still here, inside the card,
 * where they belong. See lib/program-lifecycle/coachView.ts.
 *
 * Status here is the assignment's real lifecycle status (migration 172),
 * not a guess from visibility. Draft is still shown, because a draft is a
 * real state of an unpublished assignment, but alongside the lifecycle
 * status rather than instead of it.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronDown, ChevronUp, Calendar, CheckCircle2, PauseCircle, PlayCircle } from 'lucide-react';
import type { CoachAssignedWorkout, ProgramAssignmentSummary } from '@mef/shared-types-contracts';
import {
  publishProgramAssignmentAction,
  cancelProgramAssignmentAction,
  pauseProgramAssignmentAction,
  resumeProgramAssignmentAction,
} from '@/app/actions/coach-programs';
import { describeSchedule } from '@/lib/coach-program-builder/scheduling';
import {
  buildCoachProgramGroups,
  isLiveProgramStatus,
  type CoachProgramGroup,
} from '@/lib/program-lifecycle/coachView';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const WORKOUT_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  skipped: 'Skipped',
  partially_completed: 'Partially Completed',
};

const WORKOUT_STATUS_STYLE: Record<string, string> = {
  not_started: 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]',
  in_progress: 'bg-[#F5B700]/20 text-[#854D0E]',
  completed: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-red-50 text-red-700',
  partially_completed: 'bg-[#F5B700]/20 text-[#854D0E]',
};

const PROGRAM_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  upcoming: 'Upcoming',
  paused: 'Paused',
  completed: 'Completed',
  replaced: 'Replaced',
  cancelled: 'Cancelled',
};

const PROGRAM_STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  upcoming: 'bg-[#F5B700]/20 text-[#854D0E]',
  paused: 'bg-[#1B3A2D]/[0.10] text-[#1B3A2D]',
  completed: 'bg-emerald-50 text-emerald-700',
  replaced: 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]',
  cancelled: 'bg-red-50 text-red-700',
};

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Week 2 of 4, Aug 17 to Sep 13" — the same two facts the member reads, so a coach and a member never disagree about where she is. */
function lifecycleLine(group: CoachProgramGroup): string | null {
  const parts: string[] = [];
  if (group.status === 'active' && group.currentWeek && group.durationWeeks) {
    parts.push(`Week ${group.currentWeek} of ${group.durationWeeks}`);
  } else if (group.durationWeeks) {
    parts.push(`${group.durationWeeks} week${group.durationWeeks === 1 ? '' : 's'}`);
  }
  if (group.startDate && group.endDate) {
    parts.push(`${formatDate(group.startDate)} to ${formatDate(group.endDate)}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

export function ProgramAssignmentListPanel({
  clientId,
  summaries,
  workoutsByAssignmentId,
  assignHref,
}: {
  clientId: string;
  summaries: ProgramAssignmentSummary[];
  workoutsByAssignmentId: Record<string, CoachAssignedWorkout[]>;
  assignHref: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [localSummaries, setLocalSummaries] = useState(summaries);

  const groups = buildCoachProgramGroups(localSummaries);

  /** Every lifecycle control acts on the whole program, so the optimistic patch does too. */
  function patchGroup(
    group: CoachProgramGroup,
    patch: Partial<ProgramAssignmentSummary['assignment']>
  ) {
    const ids = new Set(group.sessions.map((s) => s.assignment.id));
    setLocalSummaries((prev) =>
      prev.map((s) =>
        ids.has(s.assignment.id) ? { ...s, assignment: { ...s.assignment, ...patch } } : s
      )
    );
  }

  function handlePublish(group: CoachProgramGroup) {
    startTransition(async () => {
      for (const session of group.sessions) {
        if (session.assignment.visibility !== 'draft') continue;
        await publishProgramAssignmentAction(
          session.assignment.id,
          clientId,
          session.assignment.template_name_snapshot
        );
      }
      patchGroup(group, { visibility: 'published', published_at: new Date().toISOString() });
    });
  }

  function handleCancel(group: CoachProgramGroup) {
    if (!window.confirm(`Cancel "${group.name}"?`)) return;
    startTransition(async () => {
      await cancelProgramAssignmentAction(group.sessions[0]!.assignment.id);
      patchGroup(group, { status: 'cancelled' });
    });
  }

  function handlePause(group: CoachProgramGroup) {
    startTransition(async () => {
      const result = await pauseProgramAssignmentAction(group.sessions[0]!.assignment.id);
      if ('error' in result && result.error) return;
      patchGroup(group, { status: 'paused' });
    });
  }

  function handleResume(group: CoachProgramGroup) {
    startTransition(async () => {
      const result = await resumeProgramAssignmentAction(group.sessions[0]!.assignment.id);
      if ('error' in result && result.error) return;
      patchGroup(group, { status: 'active' });
    });
  }

  function ProgramCard({ group }: { group: CoachProgramGroup }) {
    const isExpanded = expanded === group.groupKey;
    const workouts = group.sessions.flatMap(
      (s) => workoutsByAssignmentId[s.assignment.id] ?? []
    );
    const line = lifecycleLine(group);

    return (
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#1B3A2D]">{group.name}</p>
            {line && <p className="mt-0.5 text-xs font-medium text-[#1B3A2D]">{line}</p>}
            <p className="mt-0.5 text-xs text-[#6B7A72]">
              {group.sessions.length > 1
                ? `${group.sessions.length} sessions a week`
                : describeSchedule(group.sessions[0]!.assignment.schedule_config)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {group.hasDraft && (
              <span className="rounded-full bg-[#F5B700]/20 px-2.5 py-1 text-[10px] font-medium uppercase text-[#854D0E]">
                Draft
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase ${PROGRAM_STATUS_STYLE[group.status]}`}
            >
              {PROGRAM_STATUS_LABEL[group.status]}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#6B7A72]">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {group.completedWorkouts}/{group.totalWorkouts} completed ({group.completionPercent}%)
          </span>
          {group.lastCompletedAt && (
            <span>Last completed {formatDate(group.lastCompletedAt.slice(0, 10))}</span>
          )}
          {group.nextScheduledDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Next {formatDate(group.nextScheduledDate)}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isLiveProgramStatus(group.status) && group.hasDraft && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handlePublish(group)}
              className="rounded-full bg-[#1B3A2D] px-3.5 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
              Publish
            </button>
          )}
          {(group.status === 'active' || group.status === 'upcoming') && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handlePause(group)}
              className="flex items-center gap-1 rounded-full bg-[#1B3A2D]/[0.08] px-3.5 py-1.5 text-xs font-medium text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.14] disabled:opacity-40"
            >
              <PauseCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Pause
            </button>
          )}
          {group.status === 'paused' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleResume(group)}
              className="flex items-center gap-1 rounded-full bg-[#1B3A2D] px-3.5 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
              <PlayCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Resume
            </button>
          )}
          {isLiveProgramStatus(group.status) && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleCancel(group)}
              className="rounded-full px-3.5 py-1.5 text-xs font-medium text-[#6B7A72] hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(isExpanded ? null : group.groupKey)}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-[#1B3A2D] hover:opacity-70"
          >
            {workouts.length} workout{workouts.length === 1 ? '' : 's'}
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-3 space-y-3 border-t border-[#1B3A2D]/5 pt-3">
            {group.sessions.map((session) => (
              <div key={session.assignment.id}>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  {session.assignment.template_name_snapshot}
                </p>
                <p className="text-xs text-[#6B7A72]">
                  {describeSchedule(session.assignment.schedule_config)}
                </p>
                <div className="mt-1 divide-y divide-[#1B3A2D]/5">
                  {(workoutsByAssignmentId[session.assignment.id] ?? [])
                    .slice()
                    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
                    .map((workout) => (
                      <Link
                        key={workout.id}
                        href={`/coach/clients/${clientId}/programs/workouts/${workout.id}` as Route}
                        className="flex items-center justify-between gap-3 py-2 text-sm hover:opacity-80"
                      >
                        <span className="text-[#1B3A2D]">
                          {formatDate(workout.scheduled_date)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase ${WORKOUT_STATUS_STYLE[workout.status]}`}
                        >
                          {WORKOUT_STATUS_LABEL[workout.status]}
                        </span>
                      </Link>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const live = groups.filter((g) => isLiveProgramStatus(g.status));
  const history = groups.filter((g) => !isLiveProgramStatus(g.status));

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
          Assigned Programs
        </p>
        <Link
          href={assignHref as Route}
          className="rounded-full bg-[#1B3A2D] px-4 py-2 text-xs font-medium text-white transition hover:brightness-110"
        >
          Assign a Program
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className={`${CARD} mt-3 p-6`}>
          <p className="text-sm text-[#6B7A72]">No programs assigned yet.</p>
        </div>
      ) : (
        <>
          {live.length > 0 && (
            <div className="mt-3 space-y-3">
              {live.map((group) => (
                <ProgramCard key={group.groupKey} group={group} />
              ))}
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                History
              </p>
              <div className="space-y-3">
                {history.map((group) => (
                  <ProgramCard key={group.groupKey} group={group} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
