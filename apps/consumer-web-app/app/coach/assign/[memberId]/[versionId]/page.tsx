/**
 * Assign a Program — step three: the whole program, every week of it,
 * before anybody is given anything.
 *
 * The schedule is pre-filled from the program's own shape, the preview
 * shows every week including the ones that differ, and any slot the
 * blueprint does not lock can be swapped under that slot's own rules. In
 * the common case a coach reads it and presses Approve and Assign.
 */
import { redirect, notFound } from 'next/navigation';
import type { Route } from 'next';
import { ClipboardList } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { getBlueprintPlanAction } from '@/app/actions/program-blueprints';
import { loadStaffExerciseMedia } from '@/lib/programs/staffExerciseMedia';
import { memberTodayLocalDate } from '@/lib/time/memberToday';
import { AssignPlanPanel } from './AssignPlanPanel';

export const dynamic = 'force-dynamic';

export default async function AssignProgramPreviewPage({
  params,
}: {
  params: { memberId: string; versionId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', params.memberId)
    .maybeSingle();
  if (!profile) notFound();

  // Resolved here, on the server, and handed down. See lib/time/memberToday.ts
  // for why the panel must not compute it while rendering.
  const memberToday = await memberTodayLocalDate(supabase, params.memberId);

  const plan = await getBlueprintPlanAction(params.versionId, params.memberId);
  if (!plan) notFound();

  // Posters and cues for every exercise on the plan, so a coach can watch
  // any movement here rather than in a second tab. Nothing metered is
  // requested by loading this: see lib/programs/staffExerciseMedia.ts.
  const media = await loadStaffExerciseMedia(
    supabase,
    plan.sessions.flatMap((session) => session.exercises.map((exercise) => exercise.externalId))
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref={`/coach/assign/${params.memberId}` as Route} label="Back" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Assign a Program</p>
        </div>

        <AssignPlanPanel
          memberId={params.memberId}
          memberName={profile.display_name ?? 'This member'}
          blueprintVersionId={plan.blueprint.id}
          programName={plan.blueprint.program.display_name}
          memberTitle={plan.blueprint.member_title}
          memberDescription={plan.blueprint.member_description}
          cautions={plan.blueprint.cautions}
          durationWeeks={plan.blueprint.duration_weeks ?? 4}
          periodization={plan.blueprint.periodization}
          blockedReason={plan.blockedReason}
          initialSessions={plan.sessions}
          initialExplanation={plan.memberExplanationDraft}
          memberToday={memberToday}
          media={media}
        />
      </main>
    </div>
  );
}
