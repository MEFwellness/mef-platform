import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { getMyAssignedWorkoutDetailAction } from '@/app/actions/coach-programs';
import { loadAssignedWorkoutMedia } from '@/lib/coach-program-builder/assignedWorkoutMedia';
import { MemberAssignedWorkoutDetail } from '@/components/coach-program-builder/MemberAssignedWorkoutDetail';
import { MarkProgramOpened } from '@/components/programs/MarkProgramOpened';
import { memberProgramName, memberSessionLabel } from '@/lib/programs/memberPresentation';

export default async function MyAssignedWorkoutPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');

  // member_read_own_assigned_workouts RLS (migration 82) restricts this to
  // the signed-in member's own, published workouts — anything else (not
  // theirs, or still a draft) simply returns null here.
  const workout = await getMyAssignedWorkoutDetailAction(params.id);
  if (!workout) notFound();

  // Poster frames and cues only. No video URL is resolved here or anywhere
  // else on this screen until she taps play on one exercise.
  const media = await loadAssignedWorkoutMedia(supabase, workout);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      {/* Reaching a session IS opening the program, so this is where the
          "New from your coach" mark on the Home card retires, permanently.
          Fired after paint, writes at most one row per program ever. See
          components/programs/MarkProgramOpened.tsx. */}
      <MarkProgramOpened assignmentId={workout.assignment_id} />

      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/programs" label="My Programs" />

        {/* The member-facing name, never the internal clinical title. See
            lib/programs/memberPresentation.ts. */}
        <div className="mt-4">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            {memberProgramName({
              templateName: workout.template_name,
              correctiveTags: workout.corrective_tags,
              programTags: workout.program_tags,
            })}
          </h1>
          {memberSessionLabel(workout.template_name) && (
            <p className="mt-1 text-sm font-medium text-[#6B7A72]">
              {memberSessionLabel(workout.template_name)}
            </p>
          )}
        </div>

        <div className="mt-7">
          <MemberAssignedWorkoutDetail workout={workout} media={media} />
        </div>
      </main>

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
