/**
 * Rooted Reset Fuel Pattern Assessment take flow.
 *
 * A TAKE URL ONLY EVER READS. Opening this page resumes a draft that
 * already exists, sends a member who has finished to her results, and
 * otherwise sends her back to the overview to press Begin. It cannot
 * create a session, so a refresh, a Back-then-Forward, a bookmark, a link
 * preview or the re-render a Server Action causes all write nothing at
 * all. Starting is a button, and a button is a POST. See
 * lib/assessment-runtime/entry.ts.
 *
 * AND IT STILL READS ONCE SHE HAS FINISHED. A session finished within
 * this sitting renders the very same taker, in its reveal phase, instead
 * of redirecting to the results screen, so the re-render a Server Action
 * carries lands on the reveal she is reading rather than navigating out
 * of it. Her whole member facing reading is built here from her own
 * result row, so a reload mid-reveal has everything the result page needs
 * before it mounts and never has to fetch anything once she is reading
 * it. See lib/assessment-runtime/closing.ts.
 */

import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUnifiedAssessmentQuestions } from '@/lib/assessment-foundation/repository';
import { loadFpaTakeSessionAction } from '@/app/actions/fuelPattern';
import { findFuelPatternResultBySession } from '@/lib/fuel-pattern/data';
import { buildFpaMemberResult } from '@/lib/fuel-pattern/memberResult';
import { FuelPatternTaker } from '@/components/fuel-pattern/FuelPatternTaker';
import { CLOSING_PARAM, parseClosingBeat } from '@/lib/assessment-runtime/closing';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';

export default async function TakeFuelPatternPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const result = await loadFpaTakeSessionAction();
  if (!result.ok) redirect(result.redirectTo as Route);

  const { session, phase } = result;
  const supabase = createClient();
  const questions = await getUnifiedAssessmentQuestions(supabase, session.assessmentId);
  const stored = phase === 'closing' ? await findFuelPatternResultBySession(supabase, session.id) : null;
  // 'close' is the marker this taker writes once the pattern is on the
  // screen, so a reload lands past the pause rather than replaying it.
  const startAtPattern = parseClosingBeat(searchParams?.[CLOSING_PARAM]) === 'close';

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10">
        <FuelPatternTaker
          sessionId={session.id}
          questions={questions}
          initialAnswers={session.answers}
          phase={phase}
          initialResult={stored ? buildFpaMemberResult(stored) : null}
          startAtPattern={startAtPattern}
        />
      </main>
    </div>
  );
}
