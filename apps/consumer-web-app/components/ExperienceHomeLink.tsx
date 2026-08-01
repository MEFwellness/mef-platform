'use client';

/**
 * Standard mid-flow dashboard-return affordance for multi-screen
 * experiences (Core Values Snapshot, Life Signal Check, and any future
 * assessment taker) — same visual language as the Check-In wizard's own
 * Home button (components/checkin/CheckinWizard.tsx), a labelled pill
 * rather than an icon-only glyph, since a word label is more reliably
 * tappable than a bare icon. Every answer in these takers already
 * persists per-question as it's given, so unlike the check-in wizard this
 * needs no "save progress" step before navigating away — a plain push is
 * honest.
 *
 * Real gap this closes: once a member reaches the interpretation,
 * experiment, or closing screens of a taker, the only ways back to the
 * dashboard used to be the in-flow Continue button or the phone's back
 * button — no persistent way out mid-conversation.
 */

import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Home } from 'lucide-react';

export function ExperienceHomeLink() {
  const router = useRouter();

  return (
    <div className="mb-4 flex justify-end">
      <button
        type="button"
        onClick={() => router.push('/dashboard' as Route)}
        aria-label="Return to Home"
        className="mef-press flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#1B3A2D]/20 px-4 text-[13px] font-semibold text-[#1B3A2D] transition-opacity duration-150"
      >
        <Home className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        Home
      </button>
    </div>
  );
}
