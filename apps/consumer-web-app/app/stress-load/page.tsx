/**
 * The Stress & Load Deep-Dive's own route.
 *
 * ACCESS IS ENFORCED HERE, SERVER SIDE, not merely hidden in the UI. A
 * member her coach has not assigned this to is redirected to Home before
 * any content renders, and the rule that decides it is the identical
 * getMyStressLoadDeepDive the pop-up chain and Home's card read. One rule,
 * three surfaces, no drift.
 *
 * A FINISHED SITTING IS NOT A REDIRECT. She gets her reading back rather
 * than being silently bounced, because a member who taps an old
 * notification or her own back button deserves an answer rather than a
 * mystery. Which of the two screens she sees is decided inside
 * StressLoadExperience rather than here, for the reason its own header
 * states: a Server Action re-renders this route.
 *
 * THIS RENDER WRITES NOTHING. No claim, no draft row, no session. See
 * lib/stress-load/data.ts's header.
 *
 * NO PAGE-LEVEL BACK BUTTON, deliberately. The experience carries its own
 * Close on every screen and its own Back between questions, and two
 * near-identical ways out, stacked, is noise rather than generosity (the
 * Weekly Reflection's live run, 2026-08-28).
 */

import { redirect } from 'next/navigation';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getMyStressLoadDeepDive } from '@/lib/stress-load/view';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { StressLoadExperience } from '@/components/stress-load/StressLoadExperience';

export default async function StressLoadPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const state = await getMyStressLoadDeepDive();
  if (!state) redirect('/dashboard');

  const completed =
    state.status === 'completed' && state.session.answers && state.session.interpretation
      ? {
          sessionId: state.session.id,
          answers: state.session.answers,
          interpretation: state.session.interpretation,
        }
      : null;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="stress_load_deep_dive" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="mt-4">
          <StressLoadExperience status={state.status} completed={completed} />
        </div>
      </main>
    </div>
  );
}
