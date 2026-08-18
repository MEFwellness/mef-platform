'use client';

/**
 * A coach's view of one client's programs, split by what is true right now:
 * the program she is on (at most one, since assigning a new one supersedes
 * the old one with lineage), anything upcoming or paused, and then history
 * with dates and completion rates.
 *
 * Status here is the assignment's real lifecycle status (migration 172),
 * not a guess from visibility. Draft is still shown, because a draft is a
 * real state of an unpublished assignment, but it is shown alongside the
 * lifecycle status rather than instead of it.
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

const LIVE_STATUSES = ['active', 'upcoming', 'paused'];

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Week 2 of 4, Aug 17 to Sep 13" — the same two facts the member reads, so a coach and a member never disagree about where she is. */
function lifecycleLine(assignment: ProgramAssignmentSummary['assignment']): string | null {
  const parts: string[] = [];
  if (assignment.current_week && assignment.duration_weeks && assignment.status === 'active') {
    parts.push(`Week ${assignment.current_week} of ${assignment.duration_weeks}`);
  } else if (assignment.duration_weeks) {
    parts.push(`${assignment.duration_weeks} week${assignment.duration_weeks === 1 ? '' : 's'}`);
  }
  if (assignment.start_date && assignment.end_date) {
    parts.push(`${formatDate(assignment.start_date)} to ${formatDate(assignment.end_date)}`);
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

  function patchAssignment(
    assignmentId: string,
    patch: Partial<ProgramAssignmentSummary['assignment']>
  ) {
    setLocalSummaries((prev) =>
      prev.map((s) =>
        s.assignment.id === assignmentId ? { ...s, assignment: { ...s.assignment, ...patch } } : s
      )
    );
  }

  function handlePublish(summary: ProgramAssignmentSummary) {
    startTransition(async () => {
      await publishProgramAssignmentAction(
        summary.assignment.id,
        clientId,
        summary.assignment.template_name_snapshot
      );
      patchAssignment(summary.assignment.id, {
        visibility: 'published',
        published_at: new Date().toISOString(),
      });
    });
  }

  function handleCancel(summary: ProgramAssignmentSummary) {
    if (!window.confirm(`Cancel "${summary.assignment.template_name_snapshot}"?`)) return;
    startTransition(async () => {
      await cancelProgramAssignmentAction(summary.assignment.id);
      patchAssignment(summary.assignment.id, { status: 'cancelled' });
    });
  }

  function handlePause(summary: ProgramAssignmentSummary) {
    startTransition(async () => {
      const result = await pauseProgramAssignmentAction(summary.assignment.id);
      if ('error' in result && result.error) return;
      patchAssignment(summary.assignment.id, { status: 'paused' });
    });
  }

  function handleResume(summary: ProgramAssignmentSummary) {
    startTransition(async () => {
      const result = await resumeProgramAssignmentAction(summary.assignment.id);
      if ('error' in result && result.error) return;
      patchAssignment(summary.assignment.id, { status: 'active' });
    });
  }

  function Row({ summary }: { summary: ProgramAssignmentSummary }) {
    const isExpanded = expanded === summary.assignment.id;
    const workouts = workoutsByAssignmentId[summary.assignment.id] ?? [];
    const status = summary.assignment.status;
    const line = lifecycleLine(summary.assignment);

    return (
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#1B3A2D]">
              {summary.assignment.template_name_snapshot}
            </p>
            {line && <p className="mt-0.5 text-xs font-medium text-[#1B3A2D]">{line}</p>}
            <p className="mt-0.5 text-xs text-[#6B7A72]">
              {describeSchedule(summary.assignment.schedule_config)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {summary.assignment.visibility === 'draft' && (
              <span className="rounded-full bg-[#F5B700]/20 px-2.5 py-1 text-[10px] font-medium uppercase text-[#854D0E]">
                Draft
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase ${PROGRAM_STATUS_STYLE[status]}`}
            >
              {PROGRAM_STATUS_LABEL[status]}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#6B7A72]">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {summary.completedWorkouts}/{summary.totalWorkouts} completed (
            {summary.completionPercent}%)
          </span>
          {summary.lastCompletedAt && (
            <span>Last completed {formatDate(summary.lastCompletedAt.slice(0, 10))}</span>
          )}
          {summary.nextScheduledDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Next {formatDate(summary.nextScheduledDate)}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {LIVE_STATUSES.includes(status) && summary.assignment.visibility === 'draft' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handlePublish(summary)}
              className="rounded-full bg-[#1B3A2D] px-3.5 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
              Publish
            </button>
          )}
          {(status === 'active' || status === 'upcoming') && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handlePause(summary)}
              className="flex items-center gap-1 rounded-full bg-[#1B3A2D]/[0.08] px-3.5 py-1.5 text-xs font-medium text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.14] disabled:opacity-40"
            >
              <PauseCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Pause
            </button>
          )}
          {status === 'paused' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleResume(summary)}
              className="flex items-center gap-1 rounded-full bg-[#1B3A2D] px-3.5 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
              <PlayCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Resume
            </button>
          )}
          {LIVE_STATUSES.includes(status) && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleCancel(summary)}
              className="rounded-full px-3.5 py-1.5 text-xs font-medium text-[#6B7A72] hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(isExpanded ? null : summary.assignment.id)}
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
          <div className="mt-3 divide-y divide-[#1B3A2D]/5 border-t border-[#1B3A2D]/5 pt-2">
            {workouts
              .slice()
              .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
              .map((workout) => (
                <Link
                  key={workout.id}
                  href={`/coach/clients/${clientId}/programs/workouts/${workout.id}` as Route}
                  className="flex items-center justify-between gap-3 py-2 text-sm hover:opacity-80"
                >
                  <span className="text-[#1B3A2D]">{formatDate(workout.scheduled_date)}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase ${WORKOUT_STATUS_STYLE[workout.status]}`}
                  >
                    {WORKOUT_STATUS_LABEL[workout.status]}
                  </span>
                </Link>
              ))}
          </div>
        )}
      </div>
    );
  }

  const live = localSummaries.filter((s) => LIVE_STATUSES.includes(s.assignment.status));
  const history = localSummaries.filter((s) => !LIVE_STATUSES.includes(s.assignment.status));

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

      {localSummaries.length === 0 ? (
        <div className={`${CARD} mt-3 p-6`}>
          <p className="text-sm text-[#6B7A72]">No programs assigned yet.</p>
        </div>
      ) : (
        <>
          {live.length > 0 && (
            <div className="mt-3 space-y-3">
              {live.map((summary) => (
                <Row key={summary.assignment.id} summary={summary} />
              ))}
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                History
              </p>
              <div className="space-y-3">
                {history.map((summary) => (
                  <Row key={summary.assignment.id} summary={summary} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
