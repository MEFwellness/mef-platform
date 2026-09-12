'use client';

/**
 * What she reads when the check-in is over.
 *
 * IT LEADS WITH INTERPRETATION AND NEVER WITH A SCORE. The object this
 * component is handed (BpcMemberView) has no field a number could sit in:
 * no total, no maximum, no percentage, no per item point and no reference
 * threshold. That is the fence. A future author cannot accidentally print
 * her score here, because the prop does not carry one, and a test builds
 * the view from a maximum scoring sitting and asserts the serialised
 * payload contains no digit at all.
 *
 * THE THREE AREAS ARE A ROOTED RESET READING, NOT A SUBSCALE. They are a
 * presentation grouping over one total, computed in
 * lib/breathing-check-in/signals.ts, and they change no arithmetic. They
 * are drawn as a name and a phrase, with no bar and no proportion, because
 * a bar is a number drawn sideways.
 *
 * THE DISCLAIMER IS DRAWN HERE, INSIDE THE COMPONENT, rather than left to
 * each caller. There is one results component, so there is no path through
 * this experience that shows her a reading without it.
 *
 * NEITHER BUTTON WRITES ANYTHING. Both are navigation. A results screen
 * that recorded a completion would be recording an act she has not
 * performed, and the completion that matters was written by her last
 * answer.
 */

import type { Route } from 'next';
import { ArrowRight } from 'lucide-react';
import { QuietLink } from '@/components/nav/QuietLink';
import { BPC_COPY, BPC_RESULTS_PRIMARY_HREF } from '@/lib/breathing-check-in/copy';
import type { BpcMemberView } from '@/lib/breathing-check-in/signals';

const PRIMARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1B3A2D] px-6 py-3.5 text-sm font-semibold text-[#F5F0E4] transition hover:brightness-110';
const QUIET =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl border border-[#1B3A2D]/14 bg-transparent px-6 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.05]';

export function BreathingCheckInResults({
  view,
  onHome,
}: {
  view: BpcMemberView;
  onHome: () => void;
}) {
  return (
    <div className="mef-bpc-card-in w-full">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B89340]">
        {BPC_COPY.resultsTitle}
      </p>

      <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-[1.2] text-[#1B3A2D] sm:text-[34px]">
        {view.statement}
      </h1>

      <p className="mt-4 text-[16px] leading-relaxed text-[#4F645A]">{view.supportingLine}</p>

      <div className="mt-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7C8F84]">
          {BPC_COPY.resultsSignalsHeading}
        </p>

        {/*
          A definition list, because that is what this is: three named
          things, each with one phrase about it. A screen reader hears the
          pairing rather than six unattached lines.
        */}
        <dl className="mt-4 divide-y divide-[#1B3A2D]/8 border-y border-[#1B3A2D]/8">
          {view.areas.map((area) => (
            <div
              key={area.areaKey}
              className="flex items-baseline justify-between gap-4 py-4"
            >
              <dt className="text-[15px] font-medium text-[#1B3A2D]">{area.displayName}</dt>
              <dd className="shrink-0 text-[14px] text-[#7C8F84]">{area.phrase}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="mt-7 rounded-2xl bg-[#1B3A2D]/[0.045] px-5 py-4 text-[13px] leading-relaxed text-[#4F645A]">
        {BPC_COPY.resultsDisclaimer}
      </p>

      <div className="mt-7 space-y-3">
        <QuietLink href={BPC_RESULTS_PRIMARY_HREF as Route} className={PRIMARY}>
          {BPC_COPY.resultsPrimaryCta}
          <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </QuietLink>

        <button type="button" onClick={onHome} className={QUIET}>
          {BPC_COPY.resultsSecondaryCta}
        </button>
      </div>

      <p className="mt-5 text-center text-[13px] leading-relaxed text-[#7C8F84]">
        {BPC_COPY.resultsCoachNote}
      </p>
    </div>
  );
}
