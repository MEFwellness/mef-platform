/**
 * Corrective Programs — draft review. The 4-week program laid out session
 * by session, MEF-order blocks (Release -> Mobility -> Stability ->
 * Strength -> Core), swap/remove/add per exercise, regenerate, notes, and
 * Save Draft / Discard / Approve & Assign. See DraftReviewPanel for the
 * editing logic — this file is just the server-side fetch + guard.
 */
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import {
  getCorrectiveDraftGroupAction,
  getCorrectiveExplanationDraftAction,
} from '@/app/actions/corrective-programs';
import { loadStaffExerciseMedia } from '@/lib/programs/staffExerciseMedia';
import { memberTodayLocalDate } from '@/lib/time/memberToday';
import { CORRECTIVE_PROGRAM_DURATION_WEEKS } from '@/lib/corrective-engine/approvalDefaults';
import { DraftReviewPanel } from './DraftReviewPanel';

export default async function CorrectiveDraftReviewPage({
  params,
}: {
  params: { memberId: string; groupTag: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  const programGroupTag = decodeURIComponent(params.groupTag);
  const group = await getCorrectiveDraftGroupAction(params.memberId, programGroupTag);
  if (!group) notFound();

  const { data: memberProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', params.memberId)
    .maybeSingle();

  // Resolved here, on the server, and handed down. See lib/time/memberToday.ts.
  const memberToday = await memberTodayLocalDate(supabase, params.memberId);

  const first = group.templates[0];
  // Posters and cues for every exercise in the draft, and the draft of the
  // explanation this member would be given. Neither request costs a video
  // play, and neither writes anything.
  const [media, explanationDraft] = await Promise.all([
    loadStaffExerciseMedia(
      supabase,
      group.templates.flatMap((template) =>
        template.sections.flatMap((section) => section.exercises.map((e) => e.external_id))
      )
    ),
    getCorrectiveExplanationDraftAction({
      memberId: params.memberId,
      correctiveTags: first?.corrective_tags ?? [],
      templateName: first?.name ?? 'Your program',
      equipment: first?.equipment ?? [],
      durationWeeks: CORRECTIVE_PROGRAM_DURATION_WEEKS,
      sessionsPerWeek: group.templates.length,
    }),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <DraftReviewPanel
          memberId={params.memberId}
          memberName={memberProfile?.display_name ?? 'This member'}
          group={group}
          initialExplanation={explanationDraft}
          memberToday={memberToday}
          media={media}
        />
      </main>

    </div>
  );
}
