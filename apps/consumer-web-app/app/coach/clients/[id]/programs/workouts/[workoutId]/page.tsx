import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/BottomNav';
import { getAssignedWorkoutDetailAction } from '@/app/actions/coach-programs';
import { CoachAssignedWorkoutDetail } from '@/components/coach-program-builder/CoachAssignedWorkoutDetail';

export default async function CoachAssignedWorkoutPage({
  params,
}: {
  params: { id: string; workoutId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // coach_read_assigned_assigned_workouts RLS (migration 82) — a workout
  // belonging to a client this coach isn't assigned to simply returns null.
  const workout = await getAssignedWorkoutDetailAction(params.workoutId);
  if (!workout || workout.member_id !== params.id) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={`/coach/clients/${params.id}/programs`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Programs
        </Link>

        <div className="mt-4">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            {workout.template_name}
          </h1>
        </div>

        <div className="mt-7">
          <CoachAssignedWorkoutDetail workout={workout} />
        </div>
      </main>

      <BottomNav isCoach />
    </div>
  );
}
