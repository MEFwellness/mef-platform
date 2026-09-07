/**
 * What You Put Down's own route.
 *
 * ACCESS IS ENFORCED HERE, SERVER SIDE, not merely hidden in the UI. A
 * member her coach has not assigned this to is redirected to Home before
 * any content renders, and the rule that decides it is the identical
 * getMyWhatYouPutDown the pop-up chain and Home's card read. One rule, three
 * surfaces, no drift.
 *
 * A FINISHED SITTING IS NOT A REDIRECT, and here that is load bearing
 * rather than merely kind. Finishing calls a Server Action, whose response
 * carries a re-render of this route. A branch here that sent a completed
 * sitting somewhere else would navigate her off her own closing screen the
 * instant the write landed, which is exactly the bug the Core Values
 * Snapshot, the Life Signal Check and the Readiness Pulse closings had. So
 * this route renders the experience in both states and the choice between
 * them is made inside WhatYouPutDownExperience, which stays mounted through
 * that re-render.
 *
 * THIS RENDER WRITES NOTHING. No claim, no draft row and no session. The
 * draft row is created by the first Continue she taps.
 *
 * NO PAGE-LEVEL BACK BUTTON, deliberately. The experience carries its own
 * Close on every screen and its own Back between questions.
 */

import { redirect } from 'next/navigation';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getMyWhatYouPutDown } from '@/lib/what-you-put-down/view';
import { WYPD_EMPTY_SHELF } from '@/lib/what-you-put-down/shelf';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { WhatYouPutDownExperience } from '@/components/what-you-put-down/WhatYouPutDownExperience';

export default async function WhatYouPutDownPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const state = await getMyWhatYouPutDown();
  if (!state) redirect('/dashboard');

  // A finished sitting is only handed over when it is genuinely readable:
  // the complete sheet of writing. The closing prints her question nine
  // sentence, and a half-read sheet would render the fixed line over a
  // blank, which is worse than saying nothing.
  const session = state.status === 'completed' ? state.session : null;
  const completed =
    session && session.answers
      ? { sessionId: session.id, answers: session.answers, shelf: session.shelf }
      : null;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="what_you_put_down" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="mt-4">
          <WhatYouPutDownExperience
            status={state.status}
            draft={state.status === 'pending' ? state.draft : {}}
            shelf={state.status === 'pending' ? state.shelf : WYPD_EMPTY_SHELF}
            completed={completed}
          />
        </div>
      </main>
    </div>
  );
}
