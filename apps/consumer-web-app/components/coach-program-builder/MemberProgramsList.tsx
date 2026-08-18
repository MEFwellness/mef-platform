'use client';

/**
 * A member's programs, one card per program rather than a flat list of
 * every workout ever scheduled. Each card says where she is: which week of
 * how many, the dates it runs, or that it is paused, or that it is done
 * and her coach is looking at what comes next.
 *
 * Finished programs move into a visible, read-only history with the record
 * of what she actually completed, so the end of a program is a place she
 * can go back to rather than something that quietly disappears.
 *
 * No em dashes anywhere in this file's copy. Every status label and every
 * sentence is decided by lib/program-lifecycle/memberView.ts, so the
 * wording is in one place and the tests can read it.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Calendar, CheckCircle2, PauseCircle, Clock, History } from 'lucide-react';
import type { CoachAssignedWorkout } from '@mef/shared-types-contracts';
import {
  isCurrentProgramStatus,
  type MemberProgramView,
} from '@/lib/program-lifecycle/memberView';

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

const PROGRAM_STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  upcoming: 'bg-[#F5B700]/20 text-[#854D0E]',
  paused: 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]',
  completed: 'bg-emerald-50 text-emerald-700',
  replaced: 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]',
  cancelled: 'bg-red-50 text-red-700',
};

function ProgramIcon({ status }: { status: string }) {
  const className = 'h-4 w-4';
  if (status === 'paused') return <PauseCircle className={className} strokeWidth={1.75} aria-hidden="true" />;
  if (status === 'upcoming') return <Clock className={className} strokeWidth={1.75} aria-hidden="true" />;
  if (status === 'completed') return <CheckCircle2 className={className} strokeWidth={1.75} aria-hidden="true" />;
  return <Calendar className={className} strokeWidth={1.75} aria-hidden="true" />;
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

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
          {workout.estimated_duration_minutes ? ` · ${workout.estimated_duration_minutes} min` : ''}
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

/** A program she is on now, or one about to start: the header, then her sessions. Past sessions of a running program collapse under the ones still ahead of her. */
function CurrentProgramCard({ program }: { program: MemberProgramView }) {
  const today = new Date().toISOString().slice(0, 10);
  const ahead = program.workouts.filter(
    (w) => w.scheduled_date >= today && w.status !== 'completed'
  );
  const behind = program.workouts.filter(
    (w) => w.scheduled_date < today || w.status === 'completed'
  );

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[#1B3A2D]">{program.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[#6B7A72]">
            <ProgramIcon status={program.status} />
            {program.headline}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase ${PROGRAM_STATUS_STYLE[program.status]}`}
        >
          {program.status}
        </span>
      </div>

      {program.detail && <p className="mt-2 text-sm text-[#6B7A72]">{program.detail}</p>}

      {program.totalWorkouts > 0 && (
        <p className="mt-3 text-xs text-[#6B7A72]">
          {program.completedWorkouts} of {program.totalWorkouts} sessions done
        </p>
      )}

      {ahead.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
            Coming up
          </p>
          <div className="space-y-2">
            {ahead.map((w) => (
              <WorkoutRow key={w.id} workout={w} />
            ))}
          </div>
        </div>
      )}

      {behind.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
            Already done
          </p>
          <div className="space-y-2">
            {behind.map((w) => (
              <WorkoutRow key={w.id} workout={w} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** A finished program: her completion record, and every session still openable so she can look back at what she did. */
function PastProgramCard({ program }: { program: MemberProgramView }) {
  return (
    <section className="rounded-2xl border border-[#1B3A2D]/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#1B3A2D]">{program.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[#6B7A72]">
            <ProgramIcon status={program.status} />
            {program.headline}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase ${PROGRAM_STATUS_STYLE[program.status]}`}
        >
          {program.status}
        </span>
      </div>

      {program.detail && <p className="mt-2 text-sm text-[#6B7A72]">{program.detail}</p>}

      {program.workouts.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-[#1B3A2D]">
            {program.workouts.length} session{program.workouts.length === 1 ? '' : 's'}
          </summary>
          <div className="mt-2 space-y-2">
            {program.workouts.map((w) => (
              <WorkoutRow key={w.id} workout={w} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export function MemberProgramsList({
  programs,
  workouts,
}: {
  programs: MemberProgramView[];
  /** Every published workout she has. Used only to decide the empty state, so a member with workouts but no readable lifecycle row still sees her sessions. */
  workouts: CoachAssignedWorkout[];
}) {
  const current = programs.filter((p) => isCurrentProgramStatus(p.status));
  const past = programs.filter((p) => !isCurrentProgramStatus(p.status));

  if (programs.length === 0) {
    if (workouts.length > 0) {
      return (
        <div className="space-y-2">
          {workouts.map((w) => (
            <WorkoutRow key={w.id} workout={w} />
          ))}
        </div>
      );
    }
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
      {current.map((program) => (
        <CurrentProgramCard key={program.groupKey} program={program} />
      ))}

      {past.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
            <History className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Your program history
          </p>
          <div className="space-y-3">
            {past.map((program) => (
              <PastProgramCard key={program.groupKey} program={program} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
