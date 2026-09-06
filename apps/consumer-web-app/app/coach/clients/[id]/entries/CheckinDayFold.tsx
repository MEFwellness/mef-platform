'use client';

/**
 * One day of check-in answers, folded.
 *
 * WHY THIS EXISTS. This page was 17,453px on a 390px phone, twenty one
 * full screens, and almost all of it was here: every day in the window
 * rendered every question she was asked that day, inline, all at once.
 * Thirty days of roughly eighteen answers is five hundred rows laid out
 * before a coach can look for anything, and the thing a coach actually
 * does on this screen is find a particular day.
 *
 * So a day is a row, and a row opens. The header keeps the two things
 * that are scanned across days rather than read within one: the date, and
 * whether she flagged something as new or getting worse. Those stay
 * visible while folded, because a coach scrolling this list is looking for
 * exactly them. The answers themselves are one tap away.
 *
 * THE DIGEST COUNTS WHAT IS INSIDE, and names what it counted. "18
 * answers" is every question she was put that day across all three groups,
 * so a folded day never hides the fact that it holds something.
 *
 * NOTHING IS DERIVED HERE. The digest is arithmetic over rows this page
 * already had, and the children are the same server-rendered answer blocks
 * that were always there. This screen's own rule, that nothing on it is
 * computed, inferred or scored, is untouched: counting rows is not a
 * judgment about them.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function CheckinDayFold({
  dateLabel,
  answerCount,
  editedAfterwards,
  flaggedConcern,
  hasNote,
  children,
}: {
  dateLabel: string;
  answerCount: number;
  editedAfterwards: boolean;
  flaggedConcern: boolean;
  hasNote: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const parts = [`${answerCount} answer${answerCount === 1 ? '' : 's'}`];
  if (hasNote) parts.push('a note in her own words');
  if (editedAfterwards) parts.push('edited afterwards');

  return (
    <div className="rounded-2xl bg-[#1B3A2D]/[0.035]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="mef-focus-ring flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[14px] font-medium text-[#1B3A2D]">{dateLabel}</span>
            {flaggedConcern ? (
              <span className="rounded-full border border-[#C4A050]/45 bg-[#C4A050]/12 px-2 py-0.5 text-[11px] text-[#1B3A2D]">
                Something new or getting worse
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-[12px] text-[#6B7A72]">{parts.join(', ')}.</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#6B7A72] transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      {open ? <div className="border-t border-[#1B3A2D]/8 px-4 pb-4 pt-3">{children}</div> : null}
    </div>
  );
}
