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

export default async function TakePrimalPatternPage() {
  const state = await getMyPrimalPatternTakeState();
  if (!state) redirect('/login');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8 sm:px-6 md:max-w-2xl md:px-10">
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
