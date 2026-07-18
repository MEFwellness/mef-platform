/**
 * The one-question-per-screen take flow — a focused, full-screen task
 * (no BottomNav here on purpose, same "minimal chrome during a focused
 * flow" choice already made for the Body Intelligence capture screen)
 * so nothing competes with the current question for attention.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
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
        <Link
          href={`/assessments/${params.questionnaireId}` as Route}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Save and exit
        </Link>

        <h1 className="sr-only">{state.questionnaire.title}</h1>

        <div className="mt-5">
          <AssessmentTaker
            questionnaire={state.questionnaire}
            assessmentId={state.inProgress.record.id}
            initialAnswers={state.inProgress.answers}
            resumeCategoryId={state.inProgress.record.currentCategoryId}
            resumeQuestionNumber={state.inProgress.record.currentQuestionNumber}
          />
        </div>
      </main>
    </div>
  );
}
