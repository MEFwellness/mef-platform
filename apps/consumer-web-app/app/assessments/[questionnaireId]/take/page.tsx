/**
 * The one-question-per-screen take flow — a focused, full-screen task
 * (no BottomNav here on purpose, same "minimal chrome during a focused
 * flow" choice already made for the Body Intelligence capture screen)
 * so nothing competes with the current question for attention.
 */

import { redirect } from 'next/navigation';
import { getMyTakeAssessmentState } from '@/app/actions/assessments';
import { AssessmentTaker } from '@/components/assessments/AssessmentTaker';

export default async function TakeAssessmentPage({
  params,
}: {
  params: { questionnaireId: string };
}) {
  const state = await getMyTakeAssessmentState(params.questionnaireId);
  if (!state) redirect('/login');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8 sm:px-6 md:max-w-2xl md:px-10">
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
