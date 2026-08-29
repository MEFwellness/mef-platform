import { redirect, notFound } from 'next/navigation';
import { ChevronLeft, Dumbbell } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  getClientProgramAssignmentSummariesAction,
  getClientAssignedWorkoutsAction,
} from '@/app/actions/coach-programs';
import { ProgramAssignmentListPanel } from '@/components/coach-program-builder/ProgramAssignmentListPanel';
import { ProgramSignalPanel } from '@/components/coach-program-builder/ProgramSignalPanel';
import { getProgramSignalPanelAction } from '@/app/actions/program-review';
import { buildCoachProgramGroups, isLiveProgramStatus } from '@/lib/program-lifecycle/coachView';
import type { CoachAssignedWorkout } from '@mef/shared-types-contracts';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { TestAccountChip } from '@/components/staff/TestAccountChip';

export default async function ClientProgramsPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  // RLS (coach_read_assigned_client_profile) — a client this coach isn't
  // assigned to simply returns no row.
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('display_name, is_test')
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

  // One "How the program is going" panel per program she is actually on.
  // Grouped the same way the list below groups, by program_group_key, so a
  // corrective program delivered as three weekly sessions gets one panel
  // and not three. Finished and replaced programs are not panelled: the
  // question this panel answers is about a program in flight, and the
  // question about a finished one is the review.
  const liveGroups = buildCoachProgramGroups(summaries).filter(
    (group) => isLiveProgramStatus(group.status) && !group.hasDraft
  );
  const signalPanels = (
    await Promise.all(
      liveGroups.map(async (group) => ({
        group,
        panel: await getProgramSignalPanelAction({
          memberId: params.id,
          groupKey: group.groupKey,
          programName: group.name,
        }),
      }))
    )
  ).filter((entry): entry is { group: (typeof liveGroups)[number]; panel: NonNullable<Awaited<ReturnType<typeof getProgramSignalPanelAction>>> } => entry.panel !== null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
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

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Assigned Programs
          </h1>
          {clientProfile.is_test ? <TestAccountChip /> : null}
        </div>

        {signalPanels.length > 0 && (
          <div className="mt-7 space-y-5">
            {signalPanels.map(({ group, panel }) => (
              <ProgramSignalPanel
                key={group.groupKey}
                memberId={params.id}
                groupKey={group.groupKey}
                programName={group.name}
                panel={panel}
                reviewHref={`/coach/clients/${params.id}/programs/review/${encodeURIComponent(group.groupKey)}`}
              />
            ))}
          </div>
        )}

        <div className="mt-7">
          <ProgramAssignmentListPanel
            clientId={params.id}
            summaries={summaries}
            workoutsByAssignmentId={workoutsByAssignmentId}
            assignHref={`/coach/clients/${params.id}/programs/assign`}
          />
        </div>
      </main>

    </div>
  );
}
