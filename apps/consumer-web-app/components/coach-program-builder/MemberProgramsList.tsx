'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Calendar, CheckCircle2 } from 'lucide-react';
import type { CoachAssignedWorkout } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const STATUS_STYLE: Record<string, string> = {
  not_started: 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]',
  in_progress: 'bg-[#F5B700]/20 text-[#854D0E]',
  completed: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-red-50 text-red-700',
  partially_completed: 'bg-[#F5B700]/20 text-[#854D0E]',
};

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  skipped: 'Skipped',
  partially_completed: 'Partially Completed',
};

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function MemberProgramsList({ workouts }: { workouts: CoachAssignedWorkout[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = workouts.filter((w) => w.scheduled_date >= today && w.status !== 'completed');
  const past = workouts.filter((w) => w.scheduled_date < today || w.status === 'completed');

  function WorkoutRow({ workout }: { workout: CoachAssignedWorkout }) {
    return (
      <Link
        href={`/programs/${workout.id}` as Route}
        className="flex items-center justify-between gap-3 rounded-2xl border border-[#1B3A2D]/10 bg-white p-4 transition hover:border-[#1B3A2D]/30 hover:shadow-[0_10px_28px_-8px_rgba(27,58,45,0.15)]"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#1B3A2D]">{workout.template_name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-[#6B7A72]">
            <Calendar className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
            {formatDate(workout.scheduled_date)}
            {workout.estimated_duration_minutes
              ? ` · ${workout.estimated_duration_minutes} min`
              : ''}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase ${STATUS_STYLE[workout.status]}`}
        >
          {STATUS_LABEL[workout.status]}
        </span>
      </Link>
    );
  }

  if (workouts.length === 0) {
    return (
      <div className={`${CARD} p-6`}>
        <p className="text-sm text-[#6B7A72]">
          Your coach hasn&apos;t assigned any programs yet. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
            Upcoming
          </p>
          <div className="space-y-2">
            {upcoming.map((w) => (
              <WorkoutRow key={w.id} workout={w} />
            ))}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            History
          </p>
          <div className="space-y-2">
            {past.map((w) => (
              <WorkoutRow key={w.id} workout={w} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
