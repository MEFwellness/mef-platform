import Link from 'next/link';
import type { Route } from 'next';
import { Dumbbell, Calendar, ChevronRight } from 'lucide-react';
import type { CoachAssignedWorkout } from '@mef/shared-types-contracts';
import type { MemberProgramView } from '@/lib/program-lifecycle/memberView';
import { memberSessionLabel } from '@/lib/programs/memberPresentation';

/**
 * The way into a member's assigned program from Home.
 *
 * It used to be a divider row quoting the program's stored internal title
 * above `22 workouts waiting for you`. Both halves were wrong. The first
 * put clinical vocabulary on her home screen. The second framed her
 * program as a backlog, and nobody thinks about their training as a pile
 * of twenty-two things owed. She thinks about the next one.
 *
 * So: a real card in the app's own card language, saying what the program
 * is called, where she is in it, and when her next session is, with one
 * action that opens it.
 *
 * Still conditional, same "only shown when there is something to act on"
 * posture as ConnectWearableCard and the coach dashboard's Safety Review
 * Queue: a member with no live program never sees an empty card.
 */
export function AssignedProgramsCard({
  program,
  nextWorkout,
}: {
  /** The program she is on, or null. Never a completed or replaced one: Home is about now. */
  program: MemberProgramView | null;
  /** Her next session in that program, or null when there is nothing ahead of her. */
  nextWorkout: CoachAssignedWorkout | null;
}) {
  if (!program) return null;

  const session = nextWorkout ? memberSessionLabel(nextWorkout.template_name) : null;
  const nextLine = nextWorkout
    ? `${session ? `${session}, ` : ''}${formatDate(nextWorkout.scheduled_date)}`
    : null;
  const href = (nextWorkout ? `/programs/${nextWorkout.id}` : '/programs') as Route;

  return (
    <Link
      href={href}
      className="mef-press mef-card-lift block rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]"
    >
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Your program</p>
      </div>

      <p className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]">
        {program.name}
      </p>
      <p className="mt-1 text-sm text-[#6B7A72]">{program.headline}</p>

      {nextLine && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-[#4F645A]">
          <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Next up: {nextLine}
        </p>
      )}

      <span className="mef-press mt-5 inline-flex items-center gap-2 rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)]">
        {nextWorkout ? 'Open your next session' : 'Open your program'}
        <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </span>
    </Link>
  );
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
