'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { NoticingSheet } from '@/components/dashboard/NoticingSheet';
import { COACH_LOCK_NOTE_TITLE } from '@/lib/locked-content/copy';
import { trackPaywallViewAction } from '@/app/actions/analytics';

/**
 * Wraps a locked card's (already-dimmed) content in a real button: tapping
 * it never navigates (there is nothing to navigate to yet), it reveals a
 * short, warm, Root-voiced note instead. Reuses NoticingSheet
 * (components/dashboard/NoticingSheet.tsx) — the app's one existing "tap
 * something, get a short message" bottom-sheet primitive (see its own
 * header comment for why a portal-rendered sheet, not a new toast system)
 * — rather than building a second mechanism.
 *
 * EVERY LOCK, NOT JUST THE COACH ONE (2026-08-27). This used to be the
 * coach-assignment lock's private treatment, and a plan lock rendered its
 * reason inline instead, in different words. Both kinds of lock now come
 * through here with `message` chosen by lib/locked-content/copy.ts, so
 * there is one place a lock is explained and one sentence explaining it.
 */
export function LockedCardButton({
  children,
  className = '',
  ariaLabel,
  analyticsFeature,
  message,
  lockReason,
  planHref,
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
  analyticsFeature?: string | undefined;
  /** The note itself. Callers build it with `lockNoteMessage`, never by hand. */
  message: string;
  /** Which lock this is, for the analytics event. */
  lockReason?: string | undefined;
  /** Set only for a lock she can act on herself, which today means a plan lock. */
  planHref?: Route | undefined;
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
              lockReason: lockReason ?? 'not_assigned',
            });
          }
        }}
        aria-label={ariaLabel}
        className={`block w-full text-left ${className}`}
      >
        {children}
      </button>
      <NoticingSheet title={COACH_LOCK_NOTE_TITLE} open={open} onClose={() => setOpen(false)}>
        <p className="pt-1 text-[15px] leading-relaxed text-[#1B3A2D]">{message}</p>
        {planHref ? (
          <Link
            href={planHref}
            className="mt-5 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
          >
            View Membership
          </Link>
        ) : null}
        <div className="pb-8" />
      </NoticingSheet>
    </>
  );
}
