'use client';

/**
 * The Weekly Root Review's persistent entry on Home.
 *
 * After the pop-up has had its one showing, the review does not disappear.
 * It sits on Home for the rest of the week as a collapsed entry she can
 * open, reading the same row and rendering the same WeeklyReviewBody the
 * pop-up rendered. Same one-row, single-state approach as the Priority
 * Card's pop-up and inline card.
 *
 * Collapsed by default, deliberately. It has already interrupted her once
 * this week and it should not keep doing so; what it owes her is to be
 * findable. Opening it is what fires weekly_review_viewed if the pop-up
 * never did, which is the honest reading of "it reached her".
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { RenderedReview } from '@/lib/weekly-review/types';
import { WeeklyReviewBody } from './WeeklyReviewBody';
import { TrackWeeklyReviewViewed } from './TrackWeeklyReviewViewed';

export function WeeklyReviewEntry({
  review,
  label,
  weekStart,
}: {
  review: RenderedReview;
  label: string;
  weekStart: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-label={label}
      className="rounded-[28px] border border-[#1B3A2D]/10 bg-[#F5F0E4] p-6 shadow-[0_18px_40px_-24px_rgba(14,31,23,0.35)]"
    >
      {open && <TrackWeeklyReviewViewed weekStart={weekStart} />}

      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        className="mef-focus-ring mef-press flex w-full items-center justify-between gap-4 text-left"
      >
        <span>
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#8A6D1F]">
            {label}
          </span>
          <span className="mt-1 block font-[family-name:var(--font-cormorant-garamond)] text-xl leading-tight text-[#1B3A2D]">
            {review.heading}
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-[#1B3A2D]/50" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-[#1B3A2D]/50" aria-hidden="true" />
        )}
      </button>

      {open && <WeeklyReviewBody review={review} tone="inline" showHeading={false} />}
    </section>
  );
}
