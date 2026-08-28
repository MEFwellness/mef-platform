/**
 * The Primal Pattern take flow — minimal chrome, same "focused task, no
 * BottomNav" choice as app/assessments/[questionnaireId]/take/page.tsx.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getMyPrimalPatternTakeState } from '@/app/actions/primal-pattern';
import { PrimalPatternTaker } from '@/components/primal-pattern/PrimalPatternTaker';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { createClient } from '@/lib/supabase/server';

/**
 * A TAKE URL ONLY EVER READS (2026-08-27). Opening this page resumes a
 * draft that already exists and sends everybody else to the overview,
 * where Begin, Resume and Retake are real buttons posting to real Server
 * Actions. It cannot create a draft, so a refresh, a Back-then-Forward, a
 * bookmark or the re-render a Server Action causes all write nothing.
 */
export default async function TakePrimalPatternPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 'view': this route only ever hands back a draft she already owns, and
  // her own progress is never hidden by a plan rule. The gate that decides
  // whether a NEW attempt may begin is on the button.
  const access = await checkAssessmentAccess(supabase, user.id, 'primal-pattern-diet-type', {
    intent: 'view',
  });
  if (!access.allowed) redirect('/assessments/primal-pattern-diet-type');

  const state = await getMyPrimalPatternTakeState();
  if (!state) redirect('/assessments/primal-pattern-diet-type');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10">
        <Link
          href={'/assessments/primal-pattern-diet-type' as Route}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Save and exit
        </Link>

        <h1 className="sr-only">{state.copy.displayTitle}</h1>

        <div className="mt-5">
          <PrimalPatternTaker
            questionnaire={state.questionnaire}
            assessmentId={state.inProgress.record.id}
            initialAnswers={state.inProgress.answers}
            resumeQuestionNumber={state.inProgress.record.currentQuestionNumber}
          />
        </div>
      </main>
    </div>
  );
}
