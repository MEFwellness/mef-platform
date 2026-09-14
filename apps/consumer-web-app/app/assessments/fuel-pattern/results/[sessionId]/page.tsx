/**
 * Rooted Reset Fuel Pattern Assessment results.
 *
 * WHERE A MEMBER COMES BACK TO. The full result experience, rendered
 * instantly with no reveal: the reveal belongs to the moment she finished
 * the sitting, and replaying it every time she opens her own result would
 * turn a page she came to read into a page she has to wait through. "See
 * your results" on the library card lands here.
 *
 * EVERYTHING IS READ FROM HER STORED ROW, not from a recompute, so a later
 * change to the weight map or to an observation rule cannot quietly
 * rewrite a reading she has already been given.
 *
 * NOTHING HERE IS HANDED A SCORE. The page passes the member payload built
 * by lib/fuel-pattern/memberResult.ts, which carries her pattern and her
 * observation lines and nothing else, plus the meal payload built by
 * lib/fuel-pattern/meals/memberPayload.ts, which is under the same rule.
 *
 * BUILDING THE MEAL PAYLOAD IS A READ. It resolves her four cards from
 * rows that already exist and writes nothing, so opening this page and
 * touching nothing leaves no trace. A render never decides anything.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionById } from '@/lib/assessment-runtime';
import { findFuelPatternResultBySession } from '@/lib/fuel-pattern/data';
import { buildFpaMemberResult } from '@/lib/fuel-pattern/memberResult';
import { buildFpaMealsPayload } from '@/lib/fuel-pattern/meals/memberPayload';
import {
  buildFpaExperimentPayload,
  fpaTaggableMealsFromCards,
} from '@/lib/fuel-pattern/experiment/memberPayload';
import { hasActiveRole } from '@/lib/auth/guards';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { FuelPatternResultView } from '@/components/fuel-pattern/FuelPatternResultView';
import { FPA_ROUTE } from '@/lib/fuel-pattern/constants';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';

export default async function FuelPatternResultsPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const [session, isCoach] = await Promise.all([
    getSessionById(supabase, params.sessionId),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  if (!session || session.memberId !== user.id || session.status !== 'completed') {
    redirect(FPA_ROUTE);
  }

  const stored = await findFuelPatternResultBySession(supabase, params.sessionId);
  if (!stored) redirect(FPA_ROUTE);

  const meals = await buildFpaMealsPayload(supabase, user.id, stored.pattern);
  /*
    HER EXPERIMENT IS NOT PER SITTING, ON PURPOSE. Everything above it on
    this page belongs to one reading taken on one day. A run of the 7 Day
    Fuel Experiment is the one thing she has going right now, and she has
    one at a time, so it is read for the MEMBER and shown on whichever of
    her result pages she happens to be standing on. The same decision the
    coach card made about her standing meal preferences.

    BUILDING IT IS A READ. Opening this page starts nothing.
  */
  const experiment = await buildFpaExperimentPayload(supabase, user.id, {
    taggableMeals: fpaTaggableMealsFromCards(meals),
  });

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />
        <h1 className="sr-only">Your Rooted Reset Fuel Pattern</h1>
        {/* withReveal={false}: she is not finishing anything, she is reading
            something she already finished. */}
        <FuelPatternResultView
          result={buildFpaMemberResult(stored)}
          withReveal={false}
          meals={meals}
          experiment={experiment}
        />
      </main>
      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
