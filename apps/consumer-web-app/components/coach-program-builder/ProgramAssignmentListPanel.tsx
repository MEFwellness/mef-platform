'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronDown, ChevronUp, Calendar, CheckCircle2 } from 'lucide-react';
import type { CoachAssignedWorkout, ProgramAssignmentSummary } from '@mef/shared-types-contracts';
import {
  publishProgramAssignmentAction,
  cancelProgramAssignmentAction,
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

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

  function handlePublish(summary: ProgramAssignmentSummary) {
    startTransition(async () => {
      await publishProgramAssignmentAction(
        summary.assignment.id,
        clientId,
        summary.assignment.template_name_snapshot
      );
      setLocalSummaries((prev) =>
        prev.map((s) =>
          s.assignment.id === summary.assignment.id
            ? {
                ...s,
                assignment: {
                  ...s.assignment,
                  visibility: 'published',
                  published_at: new Date().toISOString(),
                },
              }
            : s
        )
      );
    });
  }

  function handleCancel(summary: ProgramAssignmentSummary) {
    if (!window.confirm(`Cancel "${summary.assignment.template_name_snapshot}"?`)) return;
    startTransition(async () => {
      await cancelProgramAssignmentAction(summary.assignment.id);
      setLocalSummaries((prev) =>
        prev.map((s) =>
          s.assignment.id === summary.assignment.id
            ? { ...s, assignment: { ...s.assignment, status: 'cancelled' } }
            : s
        )
      );
    });
  }

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
        <div className="mt-3 space-y-3">
          {localSummaries.map((summary) => {
            const isExpanded = expanded === summary.assignment.id;
            const workouts = workoutsByAssignmentId[summary.assignment.id] ?? [];
            return (
              <div key={summary.assignment.id} className={`${CARD} p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#1B3A2D]">
                      {summary.assignment.template_name_snapshot}
                    </p>
                    <p className="mt-0.5 text-xs text-[#6B7A72]">
                      {describeSchedule(summary.assignment.schedule_config)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase ${
                        summary.assignment.status === 'cancelled'
                          ? 'bg-red-50 text-red-700'
                          : summary.assignment.visibility === 'draft'
                            ? 'bg-[#F5B700]/20 text-[#854D0E]'
                            : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {summary.assignment.status === 'cancelled'
                        ? 'Cancelled'
                        : summary.assignment.visibility === 'draft'
                          ? 'Draft'
                          : 'Published'}
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

                <div className="mt-3 flex items-center gap-2">
                  {summary.assignment.status === 'active' &&
                    summary.assignment.visibility === 'draft' && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handlePublish(summary)}
                        className="rounded-full bg-[#1B3A2D] px-3.5 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
                      >
                        Publish
                      </button>
                    )}
                  {summary.assignment.status === 'active' && (
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
                          href={
                            `/coach/clients/${clientId}/programs/workouts/${workout.id}` as Route
                          }
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
