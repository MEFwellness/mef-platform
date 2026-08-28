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
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUnifiedAssessmentQuestions } from '@/lib/assessment-foundation/repository';
import { loadCvsTakeSessionAction } from '@/app/actions/coreValuesSnapshot';
import { CoreValuesSnapshotTaker } from '@/components/core-values-snapshot/CoreValuesSnapshotTaker';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';

function checkAudioAvailable(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'audio', 'values-before-habits.mp3'));
  } catch {
    return false;
  }
}

/**
 * A TAKE URL ONLY EVER READS (2026-08-27). Opening this page resumes a
 * draft that already exists, sends a member who has finished to her
 * results, and otherwise sends her back to the overview to press Begin. It
 * cannot create a session, so a refresh, a Back-then-Forward, a bookmark,
 * a link preview or the re-render that a Server Action causes when she
 * finishes all write nothing at all. Starting is a button, and a button is
 * a POST. See lib/assessment-runtime/entry.ts.
 */
export default async function TakeCoreValuesSnapshotPage() {
  const result = await loadCvsTakeSessionAction();
  if (!result.ok) redirect(result.redirectTo as Route);

  const { session } = result;
  const supabase = createClient();
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
