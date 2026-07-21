import Link from 'next/link';
import { Dumbbell, ChevronRight } from 'lucide-react';
import type { CoachAssignedWorkout } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * Surfaces a member's coach-assigned workouts (Coach Program Builder
 * milestone) without adding a fourth DashboardQuickLinks card or a
 * BottomNav tab — both are deliberately scoped elsewhere (see those
 * components' own doc comments). Conditional, same "only shown when
 * there's something to act on" posture as ConnectWearableCard and the
 * coach dashboard's own Safety Review Queue link — a member with no
 * assigned programs never sees an empty-state card taking up space.
 */
export function AssignedProgramsCard({
  upcomingWorkouts,
}: {
  upcomingWorkouts: CoachAssignedWorkout[];
}) {
  if (upcomingWorkouts.length === 0) return null;
  const next = upcomingWorkouts[0]!;

  return (
    <Link
      href="/programs"
      className={`${CARD} flex items-center justify-between p-5 transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06]">
          <Dumbbell className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[#1B3A2D]">
            Your coach assigned &quot;{next.template_name}&quot;
          </p>
          <p className="mt-0.5 text-xs text-[#6B7A72]">
            {upcomingWorkouts.length} workout{upcomingWorkouts.length === 1 ? '' : 's'} waiting for
            you
          </p>
        </div>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-[#1B3A2D]/40"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </Link>
  );
}
