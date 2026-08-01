'use client';

/**
 * Decides which one pop-up (if any) owns the dashboard the instant this
 * page loads, and freezes that decision for the rest of the visit.
 *
 * Root's message and the wearable welcome modal (WearableWelcomeModal.tsx)
 * must never stack — Root wins whenever both are eligible, and the loser
 * waits for a later visit rather than sneaking in right after the winner
 * closes. The tricky part: answering, snoozing, or ignoring Root's
 * message calls router.refresh() (so CvsCheckinCard's own independent
 * fetch picks up the new state) — and a refresh recomputes
 * app/dashboard/page.tsx's server-side rootPopupMessage prop, which goes
 * to null the moment Root's message is handled. If WearableWelcomeModal's
 * render were gated on that same live prop, it would mount for the first
 * time right after Root's pop-up closes, i.e. exactly the stacking this
 * is supposed to prevent. Freezing "did Root win the slot" in state on
 * first render (ignoring every later prop update) is what stops that.
 */

import { useState } from 'react';
import { WearableWelcomeModal } from '@/components/wearables/WearableWelcomeModal';
import { RootMessagePopupClient } from './RootMessagePopupClient';
import type { RootPopupMessage } from '@/app/actions/rootPopupMessages';

export function HomeScreenPopups({
  rootPopupMessage,
  showWearablePrompt,
}: {
  rootPopupMessage: RootPopupMessage | null;
  showWearablePrompt: boolean;
}) {
  const [initialMessage] = useState(rootPopupMessage);
  const [rootWonThisVisit] = useState(() => rootPopupMessage !== null);

  return (
    <>
      {initialMessage && <RootMessagePopupClient message={initialMessage} />}
      {!rootWonThisVisit && showWearablePrompt && <WearableWelcomeModal />}
    </>
  );
}
