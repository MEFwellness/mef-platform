import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getClientAssessmentById, getCoachNotes } from '@/app/actions/coach';
import { BottomNav } from '@/components/BottomNav';
import { BaselineAssessmentView } from '@/components/BaselineAssessmentView';
import { CoachNotesPanel } from '../../CoachNotesPanel';

export default async function CoachAssessmentDetailPage({
  params,
}: {
  params: { id: string; submissionId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: coachProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const coachName = coachProfile?.display_name ?? 'Your coach';

  // RLS (coach_read_assigned_client_profile, migration 16) — an id for a
  // client this coach isn't assigned to simply returns no row.
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', params.id)
    .single();
  if (!clientProfile) notFound();
  const firstName = clientProfile.display_name?.split(' ')[0] ?? 'This client';

  const [assessment, notes] = await Promise.all([
    getClientAssessmentById(params.id, params.submissionId),
    getCoachNotes(params.id, params.submissionId),
  ]);
  if (!assessment) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={`/coach/clients/${params.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to {firstName}
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Assessment
        </h1>

        <div className="mt-6 space-y-5">
          <BaselineAssessmentView
            baseline={assessment}
            description={`${firstName}'s answers from this assessment.`}
          />

          {/* Notes here are scoped to this specific assessment via
              submissionId — separate from the general notes on the
              client detail page, still private and never visible to
              the member. */}
          <CoachNotesPanel
            clientId={params.id}
            initialNotes={notes}
            coachName={coachName}
            submissionId={params.submissionId}
          />
        </div>
      </main>

      {/* middleware.ts already redirected anyone without the coach role
          before this page rendered, so isCoach is always true here. */}
      <BottomNav isCoach />
    </div>
  );
}
