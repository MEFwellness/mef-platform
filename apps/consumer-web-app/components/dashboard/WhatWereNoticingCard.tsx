/**
 * Member Experience — "What We're Noticing" (Prompt 6). Same card
 * convention as Food Lens's "Patterns Worth Noticing" section
 * (app/food-lens/report/page.tsx) — plain, non-diagnostic wellness-
 * coaching language only. Renders nothing (not even an empty-state) when
 * the member has no active findings yet, same "never show a broken-
 * looking empty state" posture as the rest of this dashboard.
 */

import { getMyNoticingView } from '@/app/actions/memberNoticing';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export async function WhatWereNoticingCard() {
  const view = await getMyNoticingView();
  if (!view) return null;

  const hasAnything =
    view.noticing.length > 0 ||
    view.improving.length > 0 ||
    view.worthAttention.length > 0 ||
    view.nextSteps.length > 0;
  if (!hasAnything) return null;

  return (
    <div className={`${CARD} p-6`}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        What We&apos;re Noticing
      </p>

      {view.noticing.length > 0 && (
        <ul className="mt-3 space-y-2.5">
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

      {view.educationalNotes.length > 0 && (
        <p className="mt-4 text-xs italic text-[#6B7A72]">{view.educationalNotes[0]}</p>
      )}
    </div>
  );
}
