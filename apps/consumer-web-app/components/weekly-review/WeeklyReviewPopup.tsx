'use client';

/**
 * The Weekly Root Review as the Root pop-up on the first open of her week.
 *
 * A presentation, not a second review. It renders the identical
 * WeeklyReviewBody the persistent entry on Home renders, from the identical
 * `member_weekly_reviews` row, so acknowledging here shows acknowledged
 * there with no syncing. It also lives inside the existing pop-up chain
 * (app/actions/rootPopupMessages.ts -> RootMessagePopupClient.tsx), which
 * already decides that only one pop-up may own the screen at a time; there
 * is no second pop-up system and no second dismissal system.
 *
 * Chrome is deliberately identical to the chain's other modals: the same
 * dark-green panel, the same gold eyebrow, the same corner wash, the same
 * z-index and backdrop. A member should experience this as Root speaking,
 * exactly as she already does for a coach assignment or a day-3 follow-up.
 *
 * Like every other message in the chain there is no backdrop-click or
 * Escape dismissal. Unlike the day-3/day-7 messages there is also no "Maybe
 * later" or "Ignore": the review is not a question that can go unanswered
 * and it is not an invitation that can be declined. It is Root reporting,
 * once, and it stays reachable on Home for the rest of the week either way.
 * So the only ways out are acknowledging it and the explicit close.
 */

import { WeeklyReviewBody } from './WeeklyReviewBody';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import type { RenderedReview } from '@/lib/weekly-review/types';

export function WeeklyReviewPopup({
  review,
  label,
  closed,
  onClose,
}: {
  review: RenderedReview;
  label: string;
  closed: boolean;
  onClose: () => void;
}) {
  useBodyScrollLock(!closed);

  if (closed) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-[#0E1F17]/55 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-review-title"
        className="relative max-h-[88vh] w-full max-w-sm overflow-y-auto overflow-x-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)]"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/10"
          aria-hidden="true"
        />

        <p className="relative text-xs font-semibold uppercase tracking-wider text-[#C4A050]">
          {label}
        </p>

        <WeeklyReviewBody review={review} tone="popup" onAcknowledged={onClose} />

        <div className="relative mt-6 flex items-center justify-center border-t border-[#F5F0E4]/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="mef-press text-xs font-medium text-[#F5F0E4]/60 underline underline-offset-2 transition hover:text-[#F5F0E4]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
