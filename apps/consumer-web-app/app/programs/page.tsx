/**
 * A member's assigned workouts — the frozen prescriptions their coach has
 * scheduled for them (Coach Program Builder milestone, migration 82).
 * Reached from a conditional Dashboard card (see
 * components/AssignedProgramsCard.tsx) rather than a permanent
 * DashboardQuickLinks entry or BottomNav tab — see those components' own
 * doc comments on why each stays scoped to exactly what it already has.
 */

import { redirect } from 'next/navigation';
import { Dumbbell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import {
  getMyAssignedWorkoutsAction,
  getMyProgramViewsAction,
} from '@/app/actions/coach-programs';
import { MemberProgramsList } from '@/components/coach-program-builder/MemberProgramsList';
import { MarkProgramOpened } from '@/components/programs/MarkProgramOpened';
import { isCurrentProgramStatus } from '@/lib/program-lifecycle/memberView';
import { memberTodayLocalDate } from '@/lib/time/memberToday';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function MyProgramsPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  const [workouts, programs, today] = await Promise.all([
    getMyAssignedWorkoutsAction(),
    getMyProgramViewsAction(),
    // Where her sessions split into "Coming up" and "Already done". Decided
    // here, on the server, in her own timezone, so the list is not sorted on
    // UTC's calendar day and the two render passes cannot disagree. Same
    // rule getMyCurrentProgramEntryAction already uses for the Home card.
    memberTodayLocalDate(supabase, user.id),
  ]);

  // The other door into her program. The card on Home links here whenever
  // she has no session ahead of her, so landing on this list is opening the
  // program just as much as opening a session is, and the "New from your
  // coach" mark has to retire either way. Read off the views this screen
  // already fetched, never a second query.
  const current = programs.find((view) => isCurrentProgramStatus(view.status));

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <MarkProgramOpened assignmentId={current?.assignmentIds[0] ?? null} />

      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Home" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">My Programs</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            My Programs
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Where you are in the programs your coach has built for you.
          </p>
        </div>

        <div className="mt-7">
          <MemberProgramsList programs={programs} workouts={workouts} today={today} />
        </div>
      </main>

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
