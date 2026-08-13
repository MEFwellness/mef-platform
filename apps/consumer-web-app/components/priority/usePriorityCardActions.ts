'use client';

/**
 * The Priority Card's behavior, in one place, shared by both of its
 * presentations: the inline card (components/priority/PriorityCard.tsx)
 * and the Root pop-up (components/priority/PriorityCardPopup.tsx).
 *
 * Extracted when the card gained its pop-up delivery. The two look
 * completely different — one is a light card in the page flow, the other
 * is the dark-green modal the rest of the Root pop-up chain uses — but
 * "Done" must mean exactly the same thing in both, including its real
 * side effect of writing the Reset Plan's daily log. Duplicating three
 * handlers across two components is precisely how those two meanings drift
 * apart, so neither component owns any of this.
 *
 * Both presentations write to the same `member_daily_priorities` row via
 * the same server actions, which is what makes "Done in the pop-up shows
 * Done everywhere" true by construction rather than by any syncing. Those
 * actions are now reached through app/api/popup-response/route.ts rather
 * than called as server actions from here — same functions, same writes,
 * a delivery that a navigation cannot cancel. See that route's header.
 */

import { useRef, useState } from 'react';
import type { PriorityStatus, PriorityView } from '@/lib/priority/types';
import { optimisticWrite } from '@/lib/client/optimisticWrite';
import { deliverPopupResponse } from '@/lib/client/popupResponse';

export type PriorityCardActions = {
  status: PriorityStatus;
  helpOpen: boolean;
  onDone: () => void;
  onSave: () => void;
  onHelp: () => void;
};

export function usePriorityCardActions(view: PriorityView): PriorityCardActions {
  const [status, setStatus] = useState<PriorityStatus>(view.status);
  const [helpOpen, setHelpOpen] = useState(false);

  // There is deliberately no `pending` flag here any more.
  //
  // It used to come from `useTransition`, which in the App Router stays
  // pending for the whole server-action round trip AND the page re-render
  // that follows it, and it was wired to `disabled` on the card's buttons.
  // On the collapsed "saved" card that is a real freeze: its own Done
  // button sits there, visible and dead, for seconds on a slow connection,
  // long after the tap that saved it. Every state these buttons lead to is
  // rendered from `status`, which changes on the same tick as the tap, so
  // there was never anything for a pending flag to protect.
  //
  // The writes now run behind her, with retries, through
  // lib/client/optimisticWrite.ts. All three are idempotent: the status
  // write is an UPDATE to a fixed value and the outcome row is conditional
  // on `member_response IS NULL`.

  // The status as of the last tap, readable synchronously. Two taps in one
  // frame both close over the same rendered `status`, so the state value
  // alone cannot tell the second one that the first has already happened —
  // and the buttons genuinely are on screen for the recede beat after the
  // first tap. This is what the `pending` flag used to accidentally cover,
  // and it covers it without disabling anything.
  const statusRef = useRef<PriorityStatus>(view.status);

  function apply(next: PriorityStatus): void {
    statusRef.current = next;
    setStatus(next);
  }

  function onDone() {
    if (statusRef.current === 'done') return;
    void optimisticWrite({
      // She sees the accomplished state immediately rather than after a
      // round trip. A write that is genuinely lost leaves the server state
      // untouched and the next load simply shows the card active again,
      // which is the honest outcome.
      acknowledge: () => apply('done'),
      write: () => deliverPopupResponse({ kind: 'priority_done' }),
    });
  }

  function onSave() {
    if (statusRef.current === 'saved') return;
    void optimisticWrite({
      acknowledge: () => apply('saved'),
      write: () => deliverPopupResponse({ kind: 'priority_save' }),
    });
  }

  function onHelp() {
    // Collapsing it again is pure client state and records nothing: the
    // tap that mattered was the one that opened it.
    if (helpOpen) {
      setHelpOpen(false);
      return;
    }
    void optimisticWrite({
      // The smaller step is already on the page, so the expansion has never
      // waited on a round trip.
      acknowledge: () => setHelpOpen(true),
      // It still goes through the retrying path, because behind it is the
      // outcome ledger row that says she took the smaller way in, and that
      // must land whether or not the first attempt does.
      write: () => deliverPopupResponse({ kind: 'priority_help' }),
    });
  }

  return { status, helpOpen, onDone, onSave, onHelp };
}
