import { redirect, notFound } from 'next/navigation';
import { ChevronLeft, Dumbbell } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/BottomNav';
import {
  getClientProgramAssignmentSummariesAction,
  getClientAssignedWorkoutsAction,
} from '@/app/actions/coach-programs';
import { ProgramAssignmentListPanel } from '@/components/coach-program-builder/ProgramAssignmentListPanel';
import type { CoachAssignedWorkout } from '@mef/shared-types-contracts';

export default async function ClientProgramsPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS (coach_read_assigned_client_profile) — a client this coach isn't
  // assigned to simply returns no row.
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', params.id)
    .single();
  if (!clientProfile) notFound();
  const firstName = clientProfile.display_name?.split(' ')[0] ?? 'This client';

  const [summaries, workouts] = await Promise.all([
    getClientProgramAssignmentSummariesAction(params.id),
    getClientAssignedWorkoutsAction(params.id),
  ]);

  const workoutsByAssignmentId = workouts.reduce<Record<string, CoachAssignedWorkout[]>>(
    (acc, workout) => {
      (acc[workout.assignment_id] ??= []).push(workout);
      return acc;
    },
    {}
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={`/coach/clients/${params.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to {firstName}
        </Link>

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            {firstName}&apos;s Programs
          </p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Assigned Programs
          </h1>
        </div>

        <div className="mt-7">
          <ProgramAssignmentListPanel
            clientId={params.id}
            summaries={summaries}
            workoutsByAssignmentId={workoutsByAssignmentId}
            assignHref={`/coach/clients/${params.id}/programs/assign`}
          />
        </div>
      </main>

      <BottomNav isCoach />
    </div>
  );
}
