/**
 * Where Your Joy Lives's own route.
 *
 * ACCESS IS ENFORCED HERE, SERVER SIDE, not merely hidden in the UI. A
 * member her coach has not assigned this to is redirected to Home before
 * any content renders, and the rule that decides it is the identical
 * getMyWhereYourJoyLives the pop-up chain and Home's card read. One rule,
 * three surfaces, no drift.
 *
 * A FINISHED SITTING IS NOT A REDIRECT, and here that is load bearing
 * rather than merely kind. Finishing calls a Server Action, whose response
 * carries a re-render of this route. A branch here that sent a completed
 * sitting somewhere else would navigate her off her own closing screen the
 * instant the write landed, which is exactly the bug the Core Values
 * Snapshot, the Life Signal Check and the Readiness Pulse closings had. So
 * this route renders the experience in both states and the choice between
 * them is made inside WhereYourJoyLivesExperience, which stays mounted
 * through that re-render.
 *
 * THIS RENDER WRITES NOTHING. No claim, no draft row, no session. The draft
 * row is created by the first Continue she taps. See
 * lib/where-your-joy-lives/data.ts's header.
 *
 * NO PAGE-LEVEL BACK BUTTON, deliberately. The experience carries its own
 * Close on every screen and its own Back between questions, and two
 * near-identical ways out, stacked, is noise rather than generosity.
 */

import { redirect } from 'next/navigation';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getMyWhereYourJoyLives } from '@/lib/where-your-joy-lives/view';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { WhereYourJoyLivesExperience } from '@/components/where-your-joy-lives/WhereYourJoyLivesExperience';

export default async function WhereYourJoyLivesPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const state = await getMyWhereYourJoyLives();
  if (!state) redirect('/dashboard');

  // A finished sitting is only handed over when it is genuinely readable:
  // the complete sheet of nine. The closing centerpiece places two of those
  // nine side by side, and a half-read sheet would render one real answer
  // beside one silent blank, which is worse than saying nothing. Anything
  // less renders as the already-done panel without the pair.
  const session = state.status === 'completed' ? state.session : null;
  const completed =
    session && session.answers ? { sessionId: session.id, answers: session.answers } : null;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="where_your_joy_lives" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="mt-4">
          <WhereYourJoyLivesExperience
            status={state.status}
            draft={state.status === 'pending' ? state.draft : {}}
            completed={completed}
          />
        </div>
      </main>
    </div>
  );
}
