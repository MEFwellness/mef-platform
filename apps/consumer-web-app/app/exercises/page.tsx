/**
 * The permanent Exercise Library — search, browse, and favorite exercises
 * sourced from ExerciseAPI.dev. Foundation for future Programs, coach
 * prescriptions, member exercise history, Root recommendations, and
 * movement progression (see supabase/migrations/00000000000080_
 * exercise_library.sql). Reached from the Movement dashboard, not a new
 * BottomNav tab or DashboardQuickLinks card — see BottomNav.tsx's own doc
 * comment on why that bar stays scoped to exactly three items.
 */

import { redirect } from 'next/navigation';
import { Dumbbell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { BackButton } from '@/components/BackButton';
import { ExerciseLibraryBrowser } from '@/components/exercise-library/ExerciseLibraryBrowser';

export default async function ExerciseLibraryPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/movement" label="Movement" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Exercise Library</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Exercise Library
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Search and browse exercises — videos, instructions, and muscles worked for every move.
          </p>
        </div>

        <div className="mt-7">
          <ExerciseLibraryBrowser initialQuery={searchParams.q ?? ''} />
        </div>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
