'use client';

/**
 * What she reads when the check-in is over.
 *
 * IT LEADS WITH HER SCORE, AND THAT IS A REVERSAL. This screen shipped on
 * 2026-09-12 carrying no number at all, behind a prop that had no field a
 * number could sit in. The decision since is that a member reading her own
 * instrument is better served by the number plus the sentences that bound
 * it, so BpcMemberView now carries the total, the maximum and the
 * traditional reference threshold, and this component prints all three.
 * The guard that used to assert their absence now asserts they render.
 *
 * THE ORDER IS THE ARGUMENT. Her score, the scale it sits on, what the
 * score means, the answers that came back highest, then the three named
 * areas, then the disclaimer and the two buttons. The number comes first
 * because she came here for it, and every sentence after it is there to
 * stop the number being read as more than it is.
 *
 * THE SCALE DRAWS NO BANDS AND NO COLOUR ZONES. Three landmarks: nought,
 * the reference figure, and the maximum. An instrument that publishes ONE
 * reference point does not license four coloured severity ranges, and a
 * red zone would be this screen inventing a verdict the instrument does
 * not make. One muted rail, one hairline at the reference figure, one gold
 * marker for her.
 *
 * WHAT IS STILL FENCED. The NAME of the underlying instrument, the coach's
 * score sentence and the coaching prompt library are in
 * lib/breathing-check-in/coachCopy.ts and ./coachView.ts, and
 * tests/breathing-check-in-layers.test.tsx fails if this file can reach
 * either of them through any import path.
 *
 * THE DISCLAIMERS ARE DRAWN HERE, INSIDE THE COMPONENT, rather than left
 * to each caller. There is one results component, so there is no path
 * through this experience that shows her a reading without them.
 *
 * NEITHER BUTTON WRITES ANYTHING. Both are navigation. The primary one
 * opens a Root conversation about this sitting, which is a destination
 * that really exists; the completion that matters was written by her last
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

const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B89340]';
const SECTION_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7C8F84]';

/** Nought to one hundred, clamped, so a stored total outside the scale cannot run off the rail. */
function percentOf(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

/**
 * Where a floating LABEL sits, as opposed to where its mark sits.
 *
 * The mark is drawn at the true percentage. The label is pulled inside the
 * rail's ends so a score of nought or sixty four does not push its own
 * caption off the side of the card.
 */
function labelPercent(percent: number): number {
  return Math.min(86, Math.max(14, percent));
}

/** The intro above her strongest signals, which changes with how many qualified. */
function strongestIntro(count: number): string {
  if (count >= 3) return BPC_COPY.resultsStrongestIntro;
  if (count === 2) return BPC_COPY.resultsStrongestIntroTwo;
  if (count === 1) return BPC_COPY.resultsStrongestIntroOne;
  return BPC_COPY.resultsStrongestEmpty;
}

export function BreathingCheckInResults({
  view,
  onHome,
}: {
  view: BpcMemberView;
  onHome: () => void;
}) {
  const scorePercent = percentOf(view.totalScore, view.maxScore);
  const thresholdPercent = percentOf(view.referenceThreshold, view.maxScore);

  return (
    <div className="mef-bpc-card-in w-full">
      {/* 1. THE SCORE. */}
      <p className={EYEBROW}>{BPC_COPY.resultsTitle}</p>

      <p className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[54px] leading-[1.05] text-[#1B3A2D] sm:text-[64px]">
        {view.totalScore}
        <span className="text-[#7C8F84]"> / {view.maxScore}</span>
      </p>

      <p className="mt-2 text-[15px] leading-relaxed text-[#4F645A]">
        {view.aboveThreshold
          ? BPC_COPY.resultsAboveThresholdLine
          : BPC_COPY.resultsBelowThresholdLine}
      </p>

      {/* 2. THE SCALE. */}
      <div className="mt-8">
        {/*
          One accessible sentence in place of the drawing. A screen reader
          gets the same three landmarks a sighted member gets, in words,
          rather than a bar it cannot describe.
        */}
        <p className="sr-only">
          {`${BPC_COPY.resultsScaleAriaPrefix} 0 to ${view.maxScore}: ${view.totalScore}. ${BPC_COPY.resultsScaleThresholdLabel}: ${view.referenceThreshold}.`}
        </p>

        <div aria-hidden="true">
          {/* Her own marker's caption, above the rail. */}
          <div className="relative h-5">
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap text-[12px] font-semibold text-[#1B3A2D]"
              style={{ left: `${labelPercent(scorePercent)}%` }}
            >
              {BPC_COPY.resultsScaleYourScoreLabel}: {view.totalScore}
            </span>
          </div>

          <div className="relative mt-1.5 h-6">
            {/* The rail. */}
            <div className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-[#1B3A2D]/[0.08]" />
            {/* Filled to her score. Muted green, never a warning colour. */}
            <div
              className="absolute left-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-[#1B3A2D]/25"
              style={{ width: `${scorePercent}%` }}
            />
            {/* The one landmark inside the rail: the reference figure. */}
            <div
              className="absolute top-1/2 h-5 w-px -translate-y-1/2 bg-[#1B3A2D]/35"
              style={{ left: `${thresholdPercent}%` }}
            />
            {/* Her score. */}
            <div
              className="absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#FCFAF4] bg-[#B89340] shadow-[0_2px_8px_-2px_rgba(27,58,45,0.45)]"
              style={{ left: `${scorePercent}%` }}
            />
          </div>

          {/* The reference figure's caption, below the rail. */}
          <div className="relative mt-1.5 h-8">
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] leading-tight text-[#7C8F84]"
              style={{ left: `${labelPercent(thresholdPercent)}%` }}
            >
              {BPC_COPY.resultsScaleThresholdLabel}: {view.referenceThreshold}
            </span>
          </div>

          {/* The two ends. */}
          <div className="flex items-center justify-between text-[11px] text-[#7C8F84]">
            <span>0</span>
            <span>{view.maxScore}</span>
          </div>
        </div>
      </div>

      {/* 3. WHAT THE SCORE MEANS. */}
      <div className="mt-8">
        <p className={SECTION_LABEL}>{BPC_COPY.resultsMeaningHeading}</p>
        <p className="mt-3 text-[16px] leading-relaxed text-[#4F645A]">
          {view.aboveThreshold ? BPC_COPY.resultsMeaningAbove : BPC_COPY.resultsMeaningBelow}
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-[#4F645A]">
          {BPC_COPY.resultsScoreDisclaimer}
        </p>
      </div>

      {/* 4. HER STRONGEST SIGNALS. */}
      <div className="mt-8">
        <p className={SECTION_LABEL}>{BPC_COPY.resultsStrongestHeading}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-[#4F645A]">
          {strongestIntro(view.strongest.length)}
        </p>

        {view.strongest.length > 0 && (
          <ul className="mt-4 space-y-2.5">
            {view.strongest.map((signal) => (
              <li
                key={signal.itemId}
                className="flex items-baseline justify-between gap-4 rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3"
              >
                <span className="text-[15px] font-medium text-[#1B3A2D]">{signal.name}</span>
                <span className="shrink-0 text-[14px] text-[#7C8F84]">{signal.frequencyLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 5. THE ROOTED RESET READING, now secondary. */}
      <div className="mt-8">
        <p className={SECTION_LABEL}>{BPC_COPY.resultsSignalsHeading}</p>

        <h2 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[24px] leading-[1.25] text-[#1B3A2D] sm:text-[26px]">
          {view.statement}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[#4F645A]">{view.supportingLine}</p>

        {/*
          A definition list, because that is what this is: three named
          things, each with one phrase about it. A screen reader hears the
          pairing rather than six unattached lines.
        */}
        <dl className="mt-4 divide-y divide-[#1B3A2D]/8 border-y border-[#1B3A2D]/8">
          {view.areas.map((area) => (
            <div key={area.areaKey} className="flex items-baseline justify-between gap-4 py-4">
              <dt className="text-[15px] font-medium text-[#1B3A2D]">{area.displayName}</dt>
              <dd className="shrink-0 text-[14px] text-[#7C8F84]">{area.phrase}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* 6. THE DISCLAIMER CARD AND THE TWO BUTTONS. */}
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
