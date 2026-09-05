/**
 * Readiness Pulse take flow — mirrors
 * app/assessments/life-signal-check/take/page.tsx's access-check-before-
 * runtime ordering, handing off to the bespoke ReadinessPulseTaker
 * (intro -> 3 screens -> learned -> experiment -> resource -> close),
 * same shape as LifeSignalCheckTaker/CoreValuesSnapshotTaker.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUnifiedAssessmentQuestions } from '@/lib/assessment-foundation/repository';
import { getMyLatestLscContextForRplAction, loadRplTakeSessionAction } from '@/app/actions/readinessPulse';
import { ReadinessPulseTaker } from '@/components/readiness-pulse/ReadinessPulseTaker';
import { computeRplScoring } from '@/lib/readiness-pulse/scoring';
import { CLOSING_PARAM, parseClosingBeat } from '@/lib/assessment-runtime/closing';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';

function checkAudioAvailable(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'audio', 'readiness-is-evidence.mp3'));
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
 *
 * AND IT STILL READS ONCE SHE HAS FINISHED (2026-09-05). A session
 * finished within this sitting renders the very same taker, in its closing
 * phase, instead of redirecting to the results screen, so the re-render a
 * Server Action carries lands on the closing she is reading rather than
 * navigating out of it. The scoring is recomputed here from her own stored
 * answers, so a reload mid-closing has everything the closing needs
 * without asking the browser to remember anything. See
 * lib/assessment-runtime/closing.ts.
 */
export default async function TakeReadinessPulsePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const result = await loadRplTakeSessionAction();
  if (!result.ok) redirect(result.redirectTo as Route);

  const { session, phase } = result;
  const supabase = createClient();
  const questions = await getUnifiedAssessmentQuestions(supabase, session.assessmentId);
  const audioAvailable = checkAudioAvailable();
  const lscContext = phase === 'closing' ? await getMyLatestLscContextForRplAction() : null;
  const scoring = phase === 'closing' ? computeRplScoring(session.answers, lscContext) : null;
  const closingBeat = parseClosingBeat(searchParams?.[CLOSING_PARAM]);

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10">
        <ReadinessPulseTaker
          sessionId={session.id}
          questions={questions}
          initialAnswers={session.answers}
          audioAvailable={audioAvailable}
          phase={phase}
          initialScoring={scoring}
          initialClosingBeat={closingBeat}
        />
      </main>
    </div>
  );
}
