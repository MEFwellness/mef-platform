/**
 * Member Experience — "What We're Noticing" (Prompt 6). Same card
 * convention as Food Lens's "Patterns Worth Noticing" section
 * (app/food-lens/report/page.tsx) — plain, non-diagnostic wellness-
 * coaching language only. Renders nothing (not even an empty-state) when
 * the member has no active findings yet, same "never show a broken-
 * looking empty state" posture as the rest of this dashboard.
 *
 * Home dashboard redesign: now an image-backed carousel tile
 * (components/dashboard/NoticingTile.tsx) instead of a stacked white
 * card. There's no dedicated destination page for this exact composite
 * view, so tapping the tile opens a bottom sheet with the full original
 * content below — every section, every item, the same recommendation
 * link — completely unchanged, just relocated out of the always-visible
 * card face and behind a tap. The card-face headline is a fixed,
 * hand-written short label for this card (not derived from whichever
 * dynamic sentence happens to lead that day) — the full dynamic content
 * is what the sheet is for.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { getMyNoticingView } from '@/app/actions/memberNoticing';
import { NoticingTile } from './NoticingTile';

export async function WhatWereNoticingCard() {
  const view = await getMyNoticingView();
  if (!view) return null;

  const hasAnything =
    view.noticing.length > 0 ||
    view.improving.length > 0 ||
    view.worthAttention.length > 0 ||
    view.nextSteps.length > 0 ||
    view.recommendedInvestigation !== null;
  if (!hasAnything) return null;

  return (
    <NoticingTile
      imageSrc="/images/card-noticing.jpg"
      kicker="What We're Noticing"
      headline="Four Doctors Assessment"
      sheetTitle="What We're Noticing"
    >
      {view.noticing.length > 0 && (
        <ul className="space-y-2.5">
          {view.noticing.map((item, i) => (
            <li key={i} className="text-[15px] leading-relaxed text-[#1B3A2D]">
              {item}
            </li>
          ))}
        </ul>
      )}

      {view.improving.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            What&apos;s Improving
          </p>
          <ul className="mt-2 space-y-2">
            {view.improving.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-[#1B3A2D]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.worthAttention.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Areas Worth Paying Attention To
          </p>
          <ul className="mt-2 space-y-2">
            {view.worthAttention.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-[#1B3A2D]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.nextSteps.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Suggested Next Steps
          </p>
          <ul className="mt-2 space-y-2">
            {view.nextSteps.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-[#1B3A2D]/80">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.recommendedInvestigation && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Recommended For You
          </p>
          <Link
            href={view.recommendedInvestigation.route as Route}
            className="mt-2 block text-sm font-medium leading-relaxed text-[#3E5C46] underline underline-offset-2"
          >
            {view.recommendedInvestigation.displayName}
          </Link>
        </div>
      )}

      {view.educationalNotes.length > 0 && (
        <p className="mt-4 text-xs italic text-[#6B7A72]">{view.educationalNotes[0]}</p>
      )}
    </NoticingTile>
  );
}
