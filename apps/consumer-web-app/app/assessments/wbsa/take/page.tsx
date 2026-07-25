/**
 * WBSA take flow — mirrors app/assessments/[questionnaireId]/take/page.tsx's
 * "no BottomNav, minimal chrome during a focused flow" choice, but reads
 * through the Unified Adaptive Assessment Runtime (startOrResumeWbsaAction,
 * app/actions/wbsa.ts) instead of the generic engine.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import {
  getUnifiedAssessmentQuestions,
  getUnifiedAssessmentSections,
} from '@/lib/assessment-foundation/repository';
import { startOrResumeWbsaAction } from '@/app/actions/wbsa';
import { WbsaTaker } from '@/components/wbsa/WbsaTaker';
import { WBSA_KEY } from '@/lib/wbsa/constants';

export default async function TakeWbsaPage() {
  // Same ordering rule as the generic engine's take page: access is
  // checked before the runtime ever runs, so a locked member can't create
  // a draft session just by visiting this route.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const access = await checkAssessmentAccess(supabase, user.id, WBSA_KEY);
  if (!access.allowed) redirect('/assessments/wbsa');

  const result = await startOrResumeWbsaAction();
  if (!result.ok) redirect('/assessments/wbsa');

  const { session } = result;
  const [sections, questions] = await Promise.all([
    getUnifiedAssessmentSections(supabase, session.assessmentId),
    getUnifiedAssessmentQuestions(supabase, session.assessmentId),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8 sm:px-6 md:max-w-2xl md:px-10">
        <h1 className="sr-only">Whole-Body Systems Assessment</h1>

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
