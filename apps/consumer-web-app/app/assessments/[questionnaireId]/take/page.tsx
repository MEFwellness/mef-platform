/**
 * The one-question-per-screen take flow — a focused, full-screen task
 * (no BottomNav here on purpose, same "minimal chrome during a focused
 * flow" choice already made for the Body Intelligence capture screen)
 * so nothing competes with the current question for attention.
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { getMyTakeAssessmentState } from '@/app/actions/assessments';
import { fromPublicSlug, toPublicSlug } from '@/lib/assessments/publicSlug';
import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { AssessmentTaker } from '@/components/assessments/AssessmentTaker';

/**
 * A TAKE URL ONLY EVER READS (2026-08-27). This page used to create the
 * member's draft while rendering, and its own comment said so. Opening the
 * URL was the same act as starting the questionnaire, which is how a
 * read-only crawl, a refresh, a bookmark and the Back button could each
 * begin a 91-question assessment on her behalf. It now resumes a draft
 * that already exists and sends everybody else to the overview, where
 * Begin, Resume and Retake are real buttons posting to real Server
 * Actions. See app/actions/assessments.ts's beginAssessmentAction.
 */
export default async function TakeAssessmentPage({
  params,
}: {
  params: { questionnaireId: string };
}) {
  const questionnaireId = fromPublicSlug(params.questionnaireId);
  const overviewHref = `/assessments/${toPublicSlug(questionnaireId)}` as Route;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 'view', because this route's only job now is to hand back a draft she
  // already owns, and her own history is never hidden by a plan rule. The
  // gate that decides whether a NEW attempt may begin is on the button.
  const access = await checkAssessmentAccess(supabase, user.id, questionnaireId, {
    intent: 'view',
  });
  if (!access.allowed) redirect(overviewHref);

  const state = await getMyTakeAssessmentState(questionnaireId);
  if (!state) redirect(overviewHref);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10">
        <h1 className="sr-only">{state.copy.displayTitle}</h1>

        <AssessmentTaker
          questionnaire={state.questionnaire}
          displayTitle={state.copy.displayTitle}
          assessmentId={state.inProgress.record.id}
          initialAnswers={state.inProgress.answers}
          initialContext={state.inProgress.record.context ?? {}}
          resumeCategoryId={state.inProgress.record.currentCategoryId}
          resumeQuestionNumber={state.inProgress.record.currentQuestionNumber}
        />
      </main>
    </div>
  );
}
