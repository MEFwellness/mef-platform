/**
 * The Life You're Building's own route.
 *
 * ACCESS IS ENFORCED HERE, SERVER SIDE, not merely hidden in the UI. A
 * member her coach has not assigned this to is redirected to Home before
 * any content renders, and the rule that decides it is the identical
 * getMyTheLifeYoureBuilding the pop-up chain and Home's card read. One
 * rule, three surfaces, no drift.
 *
 * THE FOLLOW-UP IS RESOLVED HERE TOO, BY THE SAME READ, and it is handed
 * down as a prop. That is what makes the check a delivery-time one: it is
 * asked at the moment this page is about to show her the intro, not when
 * her coach pressed Assign. Once her sitting exists the stored flag on her
 * own row decides instead, so nothing rewrites a sitting she is inside.
 *
 * A FINISHED SITTING IS NOT A REDIRECT, and here that is load bearing
 * rather than merely kind. Finishing calls a Server Action, whose response
 * carries a re-render of this route. A branch here that sent a completed
 * sitting somewhere else would navigate her off her own closing screen the
 * instant the write landed, which is exactly the bug the Core Values
 * Snapshot, the Life Signal Check and the Readiness Pulse closings had. So
 * this route renders the experience in both states and the choice between
 * them is made inside TheLifeYoureBuildingExperience, which stays mounted
 * through that re-render.
 *
 * THIS RENDER WRITES NOTHING. No claim, no draft row and no session. The
 * draft row is created by the first Continue she taps.
 *
 * NO PAGE-LEVEL BACK BUTTON, deliberately. The experience carries its own
 * Close on every screen and its own Back between questions.
 */

import { redirect } from 'next/navigation';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { createClient } from '@/lib/supabase/server';
import { getMyTheLifeYoureBuilding } from '@/lib/the-life-youre-building/view';
import { TLYB_EMPTY_SLIDERS } from '@/lib/the-life-youre-building/sliders';
import { tlybFollowUpAnswerForRow } from '@/lib/the-life-youre-building/followUp';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { TheLifeYoureBuildingExperience } from '@/components/the-life-youre-building/TheLifeYoureBuildingExperience';

export default async function TheLifeYoureBuildingPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const state = await getMyTheLifeYoureBuilding();
  if (!state) redirect('/dashboard');

  // A finished sitting is only handed over when it is genuinely readable:
  // the complete sheet of writing. The closing prints her sentence under
  // her own three marks, and a half-read sheet would render the fixed line
  // over a blank, which is worse than saying nothing.
  const session = state.status === 'completed' ? state.session : null;

  // A sitting she already finished may have run as a follow-up, and the
  // "then" half of its closing is read live from the earlier sitting's own
  // stored answer rather than copied onto this row. A standalone sitting
  // costs no query at all: the null flag short-circuits before any read,
  // inside the one module that knows which template this can follow.
  const completedThen = session?.answers
    ? await tlybFollowUpAnswerForRow(
        createClient(),
        user.id,
        session.followUpSourceExperienceKey,
        session.completedAt
      )
    : null;

  const completed =
    session && session.answers
      ? {
          sessionId: session.id,
          answers: session.answers,
          sliders: session.sliders,
          followUpSourceAnswer: completedThen,
        }
      : null;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="the_life_youre_building" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="mt-4">
          <TheLifeYoureBuildingExperience
            status={state.status}
            draft={state.status === 'pending' ? state.draft : {}}
            sliders={state.status === 'pending' ? state.sliders : TLYB_EMPTY_SLIDERS}
            followUp={state.status === 'pending' ? state.followUp : null}
            completed={completed}
          />
        </div>
      </main>
    </div>
  );
}
