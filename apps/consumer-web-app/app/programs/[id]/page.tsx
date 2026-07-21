import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { getMyAssignedWorkoutDetailAction } from '@/app/actions/coach-programs';
import { MemberAssignedWorkoutDetail } from '@/components/coach-program-builder/MemberAssignedWorkoutDetail';

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/programs" label="My Programs" />

        <div className="mt-4">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            {workout.template_name}
          </h1>
        </div>

        <div className="mt-7">
          <MemberAssignedWorkoutDetail workout={workout} />
        </div>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
