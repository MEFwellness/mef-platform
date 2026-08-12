'use client';

import { useState, type ReactNode } from 'react';
import { NoticingSheet } from '@/components/dashboard/NoticingSheet';
import { COACH_LOCK_NOTE_TITLE, COACH_LOCK_NOTE_MESSAGE } from '@/lib/locked-content/copy';
import { trackPaywallViewAction } from '@/app/actions/analytics';

/**
 * Coach-Assign-Only Gating task (2026-08-04) — wraps a locked card's
 * (already-dimmed) content in a real button: tapping it never navigates
 * (there is nothing to navigate to yet), it reveals a short, warm,
 * Root-voiced note instead. Reuses NoticingSheet (components/dashboard/
 * NoticingSheet.tsx) — the app's one existing "tap something, get a short
 * message" bottom-sheet primitive (see its own header comment for why a
 * portal-rendered sheet, not a new toast system) — rather than building a
 * second mechanism.
 */
export function LockedCardButton({
  children,
  className = '',
  ariaLabel,
  analyticsFeature,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel: string;
  /**
   * Product analytics, which feature this lock is gating. Recording the
   * paywall view on the tap (rather than on mount) is deliberate: a locked
   * card can sit far down a long page and never actually be looked at,
   * whereas a tap is unambiguous proof the member hit this lock and asked
   * why. Optional so an existing caller that has no meaningful feature key
   * simply records nothing rather than a fabricated one.
   */
  analyticsFeature?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (analyticsFeature) {
            void trackPaywallViewAction({
              feature: analyticsFeature,
              lockReason: 'not_assigned',
            });
          }
        }}
        aria-label={ariaLabel}
        className={`block w-full text-left ${className}`}
      >
        {children}
      </button>
      <NoticingSheet title={COACH_LOCK_NOTE_TITLE} open={open} onClose={() => setOpen(false)}>
        <p className="pb-8 pt-1 text-[15px] leading-relaxed text-[#1B3A2D]">
          {COACH_LOCK_NOTE_MESSAGE}
        </p>
      </NoticingSheet>
    </>
  );
}
