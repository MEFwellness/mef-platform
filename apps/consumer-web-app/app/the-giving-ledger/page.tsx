/**
 * The Giving Ledger's own route.
 *
 * ACCESS IS ENFORCED HERE, SERVER SIDE, not merely hidden in the UI. A
 * member her coach has not assigned this to is redirected to Home before
 * any content renders, and the rule that decides it is the identical
 * getMyTheGivingLedger the pop-up chain and Home's card read. One rule,
 * three surfaces, no drift.
 *
 * A FINISHED SITTING IS NOT A REDIRECT, and here that is load bearing
 * rather than merely kind. Finishing calls a Server Action, whose response
 * carries a re-render of this route. A branch here that sent a completed
 * sitting somewhere else would navigate her off her own closing screen the
 * instant the write landed, which is exactly the bug the Core Values
 * Snapshot, the Life Signal Check and the Readiness Pulse closings had. So
 * this route renders the experience in both states and the choice between
 * them is made inside TheGivingLedgerExperience, which stays mounted
 * through that re-render.
 *
 * THIS RENDER WRITES NOTHING. No claim, no draft row, no session. The draft
 * row is created by the first Continue she taps. See
 * lib/the-giving-ledger/data.ts's header.
 *
 * NO PAGE-LEVEL BACK BUTTON, deliberately. The experience carries its own
 * Close on every screen and its own Back between questions, and two
 * near-identical ways out, stacked, is noise rather than generosity.
 */

import { redirect } from 'next/navigation';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getMyTheGivingLedger } from '@/lib/the-giving-ledger/view';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { TheGivingLedgerExperience } from '@/components/the-giving-ledger/TheGivingLedgerExperience';

export default async function TheGivingLedgerPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const state = await getMyTheGivingLedger();
  if (!state) redirect('/dashboard');

  // A finished sitting is only handed over when it is genuinely readable:
  // the complete sheet of nine. The closing centerpiece prints her question
  // nine sentence, and a half-read sheet would render the fixed line over a
  // blank, which is worse than saying nothing. Anything less renders as the
  // already-done panel without her sentence.
  const session = state.status === 'completed' ? state.session : null;
  const completed =
    session && session.answers ? { sessionId: session.id, answers: session.answers } : null;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="the_giving_ledger" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="mt-4">
          <TheGivingLedgerExperience
            status={state.status}
            draft={state.status === 'pending' ? state.draft : {}}
            completed={completed}
          />
        </div>
      </main>
    </div>
  );
}
