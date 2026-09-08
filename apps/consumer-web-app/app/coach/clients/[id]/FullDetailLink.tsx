/**
 * The way into a client's full detail page, in the two places it appears.
 *
 * WHAT WAS WRONG. There was exactly one door, and it was the last element
 * of a page that runs to several screens: safety, This Week, Worth
 * discussing, and six sections after that. A coach who wanted the full
 * record had to scroll the entire brief to reach the thing that opens it.
 *
 * So the same destination now has a compact action in the header, under
 * the client's name, visible on load with no scrolling, and the card at
 * the foot of the page stays where it is as the natural end-of-page exit.
 * Two doors, one route, one label, which is why the label lives here as a
 * constant rather than being typed twice.
 *
 * Presentation only. No query, no score and nothing the detail page shows
 * was touched.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { ArrowUpRight } from 'lucide-react';

/** One label for both doors, so the two can never drift apart. */
export const OPEN_FULL_DETAIL_LABEL = 'Open full detail';

/** The accessible name both doors carry, so neither reads as a bare arrow. */
export function openFullDetailAriaLabel(firstName: string): string {
  return `${OPEN_FULL_DETAIL_LABEL} for ${firstName}`;
}

/**
 * The header action. A single gold pill sized to its own text, so it sits
 * under the name without taking a card's worth of the first screen.
 */
export function OpenFullDetailAction({
  memberId,
  firstName,
  className,
}: {
  memberId: string;
  firstName: string;
  className?: string;
}) {
  return (
    <Link
      href={`/coach/clients/${memberId}/detail` as Route}
      data-detail-top-link="true"
      aria-label={openFullDetailAriaLabel(firstName)}
      className={`mef-focus-ring mef-press inline-flex items-center gap-2 rounded-full bg-[#C4A050] px-4 py-2.5 text-sm font-semibold text-[#1B3A2D] shadow-[0_6px_18px_-8px_rgba(27,58,45,0.45)] transition-colors hover:bg-[#B79340] ${className ?? ''}`}
    >
      {OPEN_FULL_DETAIL_LABEL}
      <ArrowUpRight className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
    </Link>
  );
}
