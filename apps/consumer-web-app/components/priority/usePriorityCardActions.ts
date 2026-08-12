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
 * Done everywhere" true by construction rather than by any syncing.
 */

import { useState, useTransition } from 'react';
import type { PriorityStatus, PriorityView } from '@/lib/priority/types';
import {
  completePriorityAction,
  savePriorityForLaterAction,
  trackPriorityHelpAction,
} from '@/app/actions/priority';

export type PriorityCardActions = {
  status: PriorityStatus;
  helpOpen: boolean;
  pending: boolean;
  onDone: () => void;
  onSave: () => void;
  onHelp: () => void;
};

export function usePriorityCardActions(view: PriorityView): PriorityCardActions {
  const [status, setStatus] = useState<PriorityStatus>(view.status);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onDone() {
    // Optimistic: the row write and the revalidate follow, but she sees the
    // accomplished state immediately rather than after a round trip. A
    // failed write leaves the server state untouched and the next load
    // simply shows the card active again.
    setStatus('done');
    startTransition(() => {
      void completePriorityAction();
    });
  }

  function onSave() {
    setStatus('saved');
    startTransition(() => {
      void savePriorityForLaterAction();
    });
  }

  function onHelp() {
    setHelpOpen((open) => !open);
    if (!helpOpen) {
      // Fire and forget: the smaller step is already on the page, so
      // nothing about the expansion waits on this.
      void trackPriorityHelpAction();
    }
  }

  return { status, helpOpen, pending, onDone, onSave, onHelp };
}
