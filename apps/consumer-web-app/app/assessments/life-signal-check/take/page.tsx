/**
 * Life Signal Check take flow — mirrors
 * app/assessments/core-values-snapshot/take/page.tsx's
 * access-check-before-runtime ordering, handing off to the bespoke
 * LifeSignalCheckTaker (intro -> 3 screens -> learned -> experiment ->
 * resource -> close), same shape as CoreValuesSnapshotTaker.
 */

import fs from 'node:fs';
import path from 'node:path';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { getUnifiedAssessmentQuestions } from '@/lib/assessment-foundation/repository';
import { startOrResumeLscAction } from '@/app/actions/lifeSignalCheck';
import { LifeSignalCheckTaker } from '@/components/life-signal-check/LifeSignalCheckTaker';
import { LSC_KEY } from '@/lib/life-signal-check/constants';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';

function checkAudioAvailable(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'audio', 'signals-not-verdicts.mp3'));
  } catch {
    return false;
  }
}

export default async function TakeLifeSignalCheckPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const access = await checkAssessmentAccess(supabase, user.id, LSC_KEY);
  if (!access.allowed) redirect('/assessments/life-signal-check');

  const result = await startOrResumeLscAction();
  if (!result.ok) redirect('/assessments/life-signal-check');

  const { session } = result;
  const questions = await getUnifiedAssessmentQuestions(supabase, session.assessmentId);
  const audioAvailable = checkAudioAvailable();

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10">
        <LifeSignalCheckTaker sessionId={session.id} questions={questions} initialAnswers={session.answers} audioAvailable={audioAvailable} />
      </main>
    </div>
  );
}
