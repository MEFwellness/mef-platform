/**
 * Readiness Pulse take flow — mirrors
 * app/assessments/life-signal-check/take/page.tsx's access-check-before-
 * runtime ordering, handing off to the bespoke ReadinessPulseTaker
 * (intro -> 3 screens -> learned -> experiment -> resource -> close),
 * same shape as LifeSignalCheckTaker/CoreValuesSnapshotTaker.
 */

import fs from 'node:fs';
import path from 'node:path';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { getUnifiedAssessmentQuestions } from '@/lib/assessment-foundation/repository';
import { startOrResumeRplAction } from '@/app/actions/readinessPulse';
import { ReadinessPulseTaker } from '@/components/readiness-pulse/ReadinessPulseTaker';
import { RPL_KEY } from '@/lib/readiness-pulse/constants';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';

function checkAudioAvailable(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'audio', 'readiness-is-evidence.mp3'));
  } catch {
    return false;
  }
}

/**
 * ONE ENTRY, TWO OUTCOMES (2026-08-27). Opening this URL after finishing
 * shows the results she already has, and never starts a silent new draft on
 * top of them. A retake is a deliberate choice she makes on the overview
 * screen, and arrives here as `?retake=1`.
 */
export default async function TakeReadinessPulsePage({
  searchParams,
}: {
  searchParams: { retake?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const access = await checkAssessmentAccess(supabase, user.id, RPL_KEY);
  if (!access.allowed) redirect('/assessments/readiness-pulse');

  const result = await startOrResumeRplAction({ startRetake: searchParams?.retake === '1' });
  if (!result.ok) {
    if (result.reason === 'already_completed') {
      redirect(`/assessments/readiness-pulse/results/${result.latestCompletedSessionId}`);
    }
    redirect('/assessments/readiness-pulse');
  }

  const { session } = result;
  const questions = await getUnifiedAssessmentQuestions(supabase, session.assessmentId);
  const audioAvailable = checkAudioAvailable();

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10">
        <ReadinessPulseTaker sessionId={session.id} questions={questions} initialAnswers={session.answers} audioAvailable={audioAvailable} />
      </main>
    </div>
  );
}
