'use client';

/**
 * The one back control, as a look.
 *
 * Two things in this app need to say "back" in exactly the same quiet way
 * and do completely different things with the tap: a drill-down screen goes
 * back through the router (components/BackButton.tsx), and a multi-screen
 * experience steps backward through its own state without navigating at
 * all. This is the shared presentation so those two can never drift into
 * two different looking back buttons.
 *
 * Deliberately muted: a back control is a way out, not an invitation, and
 * it must never compete with the primary action on the screen. Same
 * treatment BackButton has always had (chevron, 14px, #6B7A72, darkening on
 * hover), lifted here unchanged.
 */

import { ChevronLeft } from 'lucide-react';

export function BackControl({
  onClick,
  label = 'Back',
  /** For a screen reader, when the visible label alone would not say where back goes. */
  ariaLabel,
}: {
  onClick: () => void;
  label?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="mef-focus-ring mef-press -ml-2 inline-flex items-center gap-1 rounded-full px-2 py-2 text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D]"
    >
      <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      {label}
    </button>
  );
}
