/**
 * The Breathing Pattern Check-In's own route.
 *
 * ACCESS IS ENFORCED HERE, SERVER SIDE, not merely hidden in the UI. A
 * member her coach has not assigned this to is redirected to Home before
 * any content renders, and the rule that decides it is the identical
 * getMyBreathingCheckIn the pop-up chain and Home's card read.
 *
 * A FINISHED SITTING IS NOT A REDIRECT. She gets her reading back rather
 * than being silently bounced. Which of the screens she sees is decided
 * inside BreathingCheckInExperience rather than here, for the reason its
 * own header states: a Server Action re-renders this route.
 *
 * THIS RENDER WRITES NOTHING. No claim, no draft row, no session. The row
 * this check-in keeps while she is partway through is created by her own
 * answer and by nothing else.
 *
 * THE MEMBER VIEW IS BUILT ON THE SERVER AND IT CARRIES HER SCORE.
 * `buildBpcMemberView` takes the stored result and returns her total, the
 * maximum, the traditional reference threshold, the answers she gave
 * highest, one statement, one supporting line and three named areas. That
 * is a reversal of how this route shipped on 2026-09-12, when the prop
 * deliberately had no field a number could sit in, and it is deliberate:
 * she reads her own instrument better with the number and the sentences
 * that bound it than with the sentences alone.
 *
 * WHAT THE SERVER STILL REFUSES TO SEND HER. The NAME of the underlying
 * instrument, the coach's score sentence and the coaching prompt library.
 * Those live in two coach only modules, and
 * tests/breathing-check-in-layers.test.tsx fails if any file on this
 * page's own import graph can reach either.
 */

import { redirect } from 'next/navigation';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getMyBreathingCheckIn } from '@/lib/breathing-check-in/view';
import { buildBpcMemberView } from '@/lib/breathing-check-in/signals';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { BreathingCheckInExperience } from '@/components/breathing-check-in/BreathingCheckInExperience';

export default async function BreathingCheckInPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const state = await getMyBreathingCheckIn();
  if (!state) redirect('/dashboard');

  const completedView =
    state.status === 'completed' && state.session.results
      ? buildBpcMemberView(state.session.results)
      : null;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="breathing_check_in" />
      {/*
        WIDE ENOUGH FOR THE CARD AND NO WIDER. The card caps itself at
        680px (inside the 620 to 720 brief) and centres inside whatever
        this gives it, so a desktop never stretches it across the page and
        a phone keeps comfortable side margins rather than going edge to
        edge.
      */}
      <main className="mx-auto w-full max-w-[760px] px-5 pb-safe-nav pt-safe-header sm:px-6 md:px-10">
        <BreathingCheckInExperience
          status={state.status}
          resumeAnswers={state.status === 'in_progress' ? state.session.answers : {}}
          completedView={completedView}
        />
      </main>
    </div>
  );
}
