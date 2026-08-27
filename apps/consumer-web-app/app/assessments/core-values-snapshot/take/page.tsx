/**
 * Core Values Snapshot take flow — mirrors app/assessments/wbsa/take/
 * page.tsx's access-check-before-runtime ordering, but hands off to the
 * bespoke CoreValuesSnapshotTaker (intro -> 3 screens -> learned -> gap ->
 * experiment -> resource -> close, all in one continuous flow) rather than
 * WbsaTaker's one-question-per-screen loop — this experience's own screen
 * shape (a 4-single-select screen, a 6-slider screen, a 2-question screen,
 * then narrative beats) doesn't fit that loop, though every answer still
 * goes through the same runtime persistAnswer/completeSession calls.
 */

import fs from 'node:fs';
import path from 'node:path';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { getUnifiedAssessmentQuestions } from '@/lib/assessment-foundation/repository';
import { startOrResumeCvsAction } from '@/app/actions/coreValuesSnapshot';
import { CoreValuesSnapshotTaker } from '@/components/core-values-snapshot/CoreValuesSnapshotTaker';
import { CVS_KEY } from '@/lib/core-values-snapshot/constants';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';

function checkAudioAvailable(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'audio', 'values-before-habits.mp3'));
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
export default async function TakeCoreValuesSnapshotPage({
  searchParams,
}: {
  searchParams: { retake?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const access = await checkAssessmentAccess(supabase, user.id, CVS_KEY);
  if (!access.allowed) redirect('/assessments/core-values-snapshot');

  const result = await startOrResumeCvsAction({ startRetake: searchParams?.retake === '1' });
  if (!result.ok) {
    if (result.reason === 'already_completed') {
      redirect(`/assessments/core-values-snapshot/results/${result.latestCompletedSessionId}`);
    }
    redirect('/assessments/core-values-snapshot');
  }

  const { session } = result;
  const questions = await getUnifiedAssessmentQuestions(supabase, session.assessmentId);
  const audioAvailable = checkAudioAvailable();

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10">
        <CoreValuesSnapshotTaker
          sessionId={session.id}
          questions={questions}
          initialAnswers={session.answers}
          audioAvailable={audioAvailable}
        />
      </main>
    </div>
  );
}
