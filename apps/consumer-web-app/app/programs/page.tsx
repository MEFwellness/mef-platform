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
import { BottomNav } from '@/components/BottomNav';
import { getMyAssignedWorkoutsAction } from '@/app/actions/coach-programs';
import { MemberProgramsList } from '@/components/coach-program-builder/MemberProgramsList';

export default async function MyProgramsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  const workouts = await getMyAssignedWorkoutsAction();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
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
            Workouts your coach has prescribed for you.
          </p>
        </div>

        <div className="mt-7">
          <MemberProgramsList workouts={workouts} />
        </div>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
