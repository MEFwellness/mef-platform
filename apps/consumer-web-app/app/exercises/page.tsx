/**
 * The permanent Exercise Library — search, browse, and favorite exercises
 * sourced from Your Move (exercise-api.ymove.app), the sole exercise
 * catalog (see supabase/migrations/00000000000119_your_move_sole_catalog.sql).
 * Foundation for Programs, coach prescriptions, exercise history, Root
 * recommendations, and movement progression.
 *
 * COACH AND ADMINISTRATOR ONLY. This was a member screen reached from the
 * Movement dashboard; it is now an internal coaching tool, reached from
 * the coach and admin dashboards instead. See lib/auth/staffRouting.ts's
 * STAFF_ONLY_PREFIXES for why, and lib/auth/staffOnlyPage.ts for the
 * server-side half of the gate middleware.ts also enforces. A member who
 * types this URL is redirected to their own Movement screen.
 */

import type { Route } from 'next';
import { Dumbbell } from 'lucide-react';
import { StaffNav } from '@/components/StaffNav';
import { BackButton } from '@/components/BackButton';
import { requireStaffForInternalTool } from '@/lib/auth/staffOnlyPage';
import { ExerciseLibraryBrowser } from '@/components/exercise-library/ExerciseLibraryBrowser';

export default async function ExerciseLibraryPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const { isCoach, isAdmin } = await requireStaffForInternalTool();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref={(isCoach ? '/coach' : '/admin') as Route} label="Back" forceFallback />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Exercise Library</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Exercise Library
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Search and browse exercises: videos, instructions, and muscles worked for every move.
          </p>
        </div>

        <div className="mt-7">
          <ExerciseLibraryBrowser initialQuery={searchParams.q ?? ''} />
        </div>
      </main>

      <StaffNav isCoach={isCoach} isAdmin={isAdmin} />
    </div>
  );
}
