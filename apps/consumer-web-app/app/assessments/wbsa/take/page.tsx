/**
 * WBSA take flow — mirrors app/assessments/[questionnaireId]/take/page.tsx's
 * "no BottomNav, minimal chrome during a focused flow" choice, but reads
 * through the Unified Adaptive Assessment Runtime (startOrResumeWbsaAction,
 * app/actions/wbsa.ts) instead of the generic engine.
 */

import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getUnifiedAssessmentQuestions,
  getUnifiedAssessmentSections,
} from '@/lib/assessment-foundation/repository';
import { loadWbsaTakeSessionAction } from '@/app/actions/wbsa';
import { WbsaTaker } from '@/components/wbsa/WbsaTaker';

/**
 * A TAKE URL ONLY EVER READS (2026-08-27). Opening this page resumes a
 * draft that already exists, sends a member who has finished to her
 * results, and otherwise sends her back to the overview to press Begin. It
 * cannot create a session, so a refresh, a Back-then-Forward, a bookmark,
 * a link preview or the re-render that a Server Action causes when she
 * finishes all write nothing at all. Starting is a button, and a button is
 * a POST. See lib/assessment-runtime/entry.ts.
 */
export default async function TakeWbsaPage() {
  const result = await loadWbsaTakeSessionAction();
  if (!result.ok) redirect(result.redirectTo as Route);

  const { session } = result;
  const supabase = createClient();
  const [sections, questions] = await Promise.all([
    getUnifiedAssessmentSections(supabase, session.assessmentId),
    getUnifiedAssessmentQuestions(supabase, session.assessmentId),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10">
        <h1 className="sr-only">Whole-Body Check-In</h1>

        <WbsaTaker
          sessionId={session.id}
          sections={sections}
          questions={questions}
          initialAnswers={session.answers}
          resumeQuestionKey={session.currentQuestion?.question_key ?? null}
        />
      </main>
    </div>
  );
}
