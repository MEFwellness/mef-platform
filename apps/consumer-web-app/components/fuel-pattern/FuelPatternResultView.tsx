'use client';

/**
 * Rooted Reset Fuel Pattern Assessment — the result experience.
 *
 * =====================================================================
 * THE REVEAL, AND WHY IT IS A STATE MACHINE RATHER THAN A SCROLL.
 * =====================================================================
 *
 * Three beats, in this order, and she cannot arrive at the third before
 * the first two have had their moment:
 *
 *   1. "Assessment complete." alone, on a calm screen.
 *   2. The eyebrow, then her pattern name in display type, as the focal
 *      point of the screen.
 *   3. A gold hairline, then the one sentence that interprets it, then
 *      the rest of the page, which she meets by scrolling.
 *
 * Everything below the hero is wrapped in the app's own RevealOnScroll,
 * so the supporting sections arrive as she reaches them rather than all
 * at once. Reduced motion goes straight to the finished page with no
 * pause and no movement anywhere.
 *
 * =====================================================================
 * IT HOLDS. NOTHING BEHIND IT CAN MOVE HER ON.
 * =====================================================================
 *
 * This is the bug class that skipped premium closings elsewhere in the
 * app: a screen that reads correctly, then a background Server Action
 * re-renders the route underneath it and the member is bounced forward
 * into the next thing. Three properties keep it from happening here, and
 * all three are deliberate:
 *
 *   - EVERYTHING THIS SCREEN DRAWS IS ALREADY IN ITS PROPS. The whole
 *     member payload (her pattern and her observation lines) is computed
 *     on the server before this component mounts, so there is no fetch,
 *     no Server Action and no router call anywhere in this file. It
 *     cannot be waiting on something that could replace it.
 *   - THE BEAT IS CLIENT STATE. A parent re-render does not reset it,
 *     and there is no effect that recomputes it from anything a server
 *     might change.
 *   - THE ONLY WAY OUT IS THE BUTTON AT THE FOOT OF THE PAGE. Nothing
 *     here redirects, replaces or pushes on a timer.
 *
 * =====================================================================
 * WHAT IS NOT ON THIS SCREEN.
 * =====================================================================
 *
 * No score, no confidence level, no tendency, no internal number. It is
 * handed FpaMemberResult and that object has two fields
 * (lib/fuel-pattern/memberResult.ts), so there is nothing here to leak.
 *
 * Her meals (Build 3) and her 7 Day Fuel Experiment (Build 4) sit
 * between the plate and the forward look, in that order, and both obey
 * every rule above. Every meal the meals section could ever show came
 * down with the page, a swap is chosen in her browser by the server's own
 * pure picker, and the server is told afterwards over a route handler.
 * Every check she has logged came down with the page too, so a new one is
 * folded in and the standing insight recomputed in her browser by the
 * server's own engine, and the server is told over the same kind of route
 * handler. Neither section can re-render this route and neither can
 * replace the screen she is reading.
 *
 * =====================================================================
 * THE BUTTON AT THE FOOT SAYS WHICH MOMENT THIS IS.
 * =====================================================================
 *
 * Before she has started a run, the page has one thing to offer and the
 * bottom button is START MY EXPERIMENT, so the offer is not buried in a
 * section she may not scroll to. Once a run is going or finished, the
 * offer has been taken and the button is Continue. The two are the same
 * control in two states rather than two controls, because a page with
 * both would be asking her to choose between them.
 */

import { useEffect, useState } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { RevealOnScroll } from '@/components/dashboard/RevealOnScroll';
import { CVS_DISPLAY_FONT, CVS_GOLD_DIVIDER } from '@/components/core-values-snapshot/theme';
import {
  FPA_CONTINUE_LABEL,
  FPA_RANGE_FOOTNOTE,
  FPA_REVEAL_COPY,
  FPA_SECTION_HEADERS,
  FPA_STARTING_RANGE,
  FUEL_PATTERN_INTERPRETATION,
  FUEL_PATTERN_LABEL,
  fpaWatchForCopy,
} from '@/lib/fuel-pattern/copy';
import { FPA_NO_OBSERVATIONS_LINE } from '@/lib/fuel-pattern/observations';
import { FPA_EXPERIMENT_START_LABEL } from '@/lib/fuel-pattern/experiment/copy';
import type { FpaExperimentPayload } from '@/lib/fuel-pattern/experiment/payload';
import { FPA_PLATE_GUIDE } from '@/lib/fuel-pattern/plate';
import type { FpaMemberResult } from '@/lib/fuel-pattern/memberResult';
import type { FpaMealsPayload } from '@/lib/fuel-pattern/meals/payload';
import { FuelMealsSection } from './meals/FuelMealsSection';
import { FuelExperimentSection } from './experiment/FuelExperimentSection';
import { useFuelExperiment } from './experiment/useFuelExperiment';
import { PLATE_COMPONENT, PlateIllustration } from './PlateIllustration';

/** How long "Assessment complete." holds alone. */
const COMPLETE_MS = 2200;
/** How long her pattern name stands as the only thing on the screen. */
const PATTERN_MS = 1900;

type Beat = 'complete' | 'pattern' | 'full';

const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.2em] text-[#B89340]';
const SECTION_HEADER = 'text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7A72]';

export function FuelPatternResultView({
  result,
  /**
   * True when she is meeting this reading for the first time, at the end
   * of the sitting she just finished. A member coming back to a stored
   * result has already had the reveal and gets the finished page.
   */
  withReveal,
  /**
   * Her four meal cards and every candidate that could replace them,
   * built on the server. Null only where the page could not read her
   * meal rows at all, in which case the section is simply absent rather
   * than drawn empty.
   */
  meals = null,
  /**
   * Her live run, her checks and her calendar day, all built on the
   * server. Null only where the page could not read her experiment rows
   * at all, in which case the section is absent rather than drawn empty.
   */
  experiment = null,
}: {
  result: FpaMemberResult;
  withReveal: boolean;
  meals?: FpaMealsPayload | null;
  experiment?: FpaExperimentPayload | null;
}) {
  const router = useRouter();
  /*
    THE RUN LIVES HERE, not inside the section, because the button at the
    foot of the page reads the same state the section does. Two copies of
    "has she started" would be two answers to one question, which is the
    standing one-source-of-truth rule applied to a single screen.

    The hook holds state and callbacks only. It runs nothing on mount,
    fetches nothing on mount and cannot be null, so calling it above the
    early return for the first beat is safe and keeps the order of hooks
    identical on every render.
  */
  const experimentState = useFuelExperiment(
    experiment ?? { todayLocalDate: '', run: null, taggableMeals: [] }
  );
  const [beat, setBeat] = useState<Beat>(withReveal ? 'complete' : 'full');

  useEffect(() => {
    if (beat === 'full') return undefined;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setBeat('full');
      return undefined;
    }

    const timer = setTimeout(
      () => setBeat(beat === 'complete' ? 'pattern' : 'full'),
      beat === 'complete' ? COMPLETE_MS : PATTERN_MS
    );
    return () => clearTimeout(timer);
  }, [beat]);

  if (beat === 'complete') {
    return (
      <div className="mef-fade-in flex min-h-[70vh] flex-col items-center justify-center text-center">
        <h2 className={`${CVS_DISPLAY_FONT} text-[32px] leading-tight text-[#1B3A2D]`}>
          {FPA_REVEAL_COPY.completeHeadline}
        </h2>
      </div>
    );
  }

  const pattern = result.pattern;
  const range = FPA_STARTING_RANGE[pattern];
  const plate = FPA_PLATE_GUIDE[pattern];
  const showsBody = beat === 'full';

  return (
    <div>
      {/*
        1. YOUR FUEL PATTERN, and 2. the one sentence under it. One card,
        because they are one statement: the hairline and the sentence fade
        in beneath a name that is already on the screen rather than
        arriving as a second card.
      */}
      <section
        className={`mef-screen-enter rounded-[28px] border border-[#1B3A2D]/8 bg-[#FFFDF8] p-7 text-center shadow-[0_20px_50px_-30px_rgba(27,58,45,0.5)] sm:p-9 ${
          showsBody ? '' : 'flex min-h-[60vh] flex-col justify-center'
        }`}
        aria-labelledby="fpa-pattern-name"
      >
        <p className={EYEBROW}>{FPA_REVEAL_COPY.patternEyebrow}</p>
        <h2
          id="fpa-pattern-name"
          className={`${CVS_DISPLAY_FONT} mt-3 text-[40px] leading-[1.08] text-[#1B3A2D] sm:text-[52px]`}
        >
          {FUEL_PATTERN_LABEL[pattern]}
        </h2>

        <div
          className={`transition-opacity duration-1000 ease-out motion-reduce:transition-none ${
            showsBody ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className={`${CVS_GOLD_DIVIDER} mx-auto mt-6 max-w-[220px]`} aria-hidden="true" />
          <p className="mt-6 text-[15.5px] leading-[1.75] text-[#1B3A2D]">
            {FUEL_PATTERN_INTERPRETATION[pattern]}
          </p>
        </div>
      </section>

      {showsBody && (
        <>
          {/* 3. WHY THIS PATTERN FITS YOU, from her own answers and nothing else. */}
          <RevealOnScroll className="mt-5">
            <section className="rounded-[28px] border border-[#1B3A2D]/8 bg-[#F3F6F4] p-6 sm:p-7">
              <p className={SECTION_HEADER}>{FPA_SECTION_HEADERS.why}</p>
              {result.observations.length > 0 ? (
                <>
                  <p className="mt-4 text-sm font-medium text-[#3F5B50]">
                    {FPA_SECTION_HEADERS.whyLeadIn}
                  </p>
                  <ul className="mt-3 space-y-3.5">
                    {result.observations.map((line) => (
                      <li key={line} className="flex gap-3">
                        <span
                          aria-hidden="true"
                          className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#C4A050]"
                        />
                        <span className="text-[15px] leading-[1.65] text-[#1B3A2D]">{line}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                /*
                  FEWER THAN TWO LINES QUALIFIED, which is what a genuinely
                  varied sitting looks like. The section still draws,
                  because pretending it is not there would be the same as
                  padding it: what her answers said is that they did not
                  point one way, and that is worth saying out loud.
                */
                <p className="mt-4 text-[15px] leading-[1.65] text-[#1B3A2D]">
                  {FPA_NO_OBSERVATIONS_LINE}
                </p>
              )}
            </section>
          </RevealOnScroll>

          {/* 4. YOUR STARTING RANGE. Words only, never a percentage or a gram. */}
          <RevealOnScroll className="mt-5" delayMs={60}>
            <section className="rounded-[28px] border border-[#1B3A2D]/8 bg-[#FFFDF8] p-6 shadow-[0_2px_24px_-8px_rgba(27,58,45,0.18)] sm:p-7">
              <p className={SECTION_HEADER}>{FPA_SECTION_HEADERS.range}</p>
              <dl className="mt-4 divide-y divide-[#1B3A2D]/8">
                {range.rows.map((row) => (
                  <div key={row.nutrient} className="flex items-baseline justify-between gap-4 py-3.5">
                    <dt className="text-[15px] text-[#3F5B50]">{row.nutrient}</dt>
                    <dd className={`${CVS_DISPLAY_FONT} text-[21px] leading-none text-[#1B3A2D]`}>
                      {row.level}
                    </dd>
                  </div>
                ))}
              </dl>
              {range.extraLine && (
                <p className="mt-4 text-[14px] leading-relaxed text-[#3F5B50]">{range.extraLine}</p>
              )}
              <p className="mt-5 text-[12.5px] leading-relaxed text-[#6B7A72]">
                {FPA_RANGE_FOOTNOTE}
              </p>
            </section>
          </RevealOnScroll>

          {/* 5. YOUR STARTING PLATE. */}
          <RevealOnScroll className="mt-5" delayMs={60}>
            <section className="rounded-[28px] border border-[#1B3A2D]/8 bg-[#FAF7F0] p-6 sm:p-7">
              {/* Every proportion below is a word. See lib/fuel-pattern/plate.ts
                  for why this section carries no number and therefore no
                  STARTING EXPERIMENT label. */}
              <p className={SECTION_HEADER}>{FPA_SECTION_HEADERS.plate}</p>

              <div
                data-fpa-starting-plate
                className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-7"
              >
                <PlateIllustration shape={plate.shape} size={168} />
                <ul className="w-full space-y-3">
                  {plate.segments.map((segment) => (
                    <li key={segment.component} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-[6px] inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: PLATE_COMPONENT[segment.component].color }}
                      />
                      <span>
                        <span className="block text-[15px] font-medium leading-tight text-[#1B3A2D]">
                          {segment.label}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-tight text-[#6B7A72]">
                          {segment.proportion}
                        </span>
                      </span>
                    </li>
                  ))}
                  <li className="flex items-start gap-3 border-t border-[#1B3A2D]/8 pt-3">
                    <span
                      aria-hidden="true"
                      className="mt-[6px] inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PLATE_COMPONENT.fat.color }}
                    />
                    <span className="text-[15px] font-medium leading-tight text-[#1B3A2D]">
                      {plate.addition}
                    </span>
                  </li>
                </ul>
              </div>

              {plate.caption && (
                <p className="mt-5 text-[14px] leading-relaxed text-[#3F5B50]">{plate.caption}</p>
              )}
            </section>
          </RevealOnScroll>

          {/* 6. MEALS BUILT FOR YOUR PATTERN. */}
          {meals && <FuelMealsSection payload={meals} />}

          {/* 7. YOUR 7-DAY FUEL EXPERIMENT. */}
          {experiment && (
            <FuelExperimentSection
              state={experimentState}
              taggableMeals={experiment.taggableMeals}
            />
          )}

          {/* 8. WHAT ROOTED RESET WILL WATCH FOR, which now names the
              experiment directly above it. */}
          <RevealOnScroll className="mt-5" delayMs={60}>
            <section className="rounded-[28px] bg-[#1B3A2D] p-6 shadow-[0_18px_44px_-28px_rgba(27,58,45,0.65)] sm:p-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C4A050]">
                {FPA_SECTION_HEADERS.watchFor}
              </p>
              <p className="mt-4 text-[15.5px] leading-[1.75] text-[#F5F0E4]" data-fpa-digits>
                {fpaWatchForCopy(pattern)}
              </p>
            </section>
          </RevealOnScroll>

          {/* 9. The one button at the foot, in whichever of its two
              states this moment calls for. */}
          <RevealOnScroll className="mt-5" delayMs={60}>
            {experiment && !experimentState.run ? (
              <button
                type="button"
                onClick={experimentState.start}
                disabled={experimentState.busy}
                data-fpa-bottom-cta
                className="mef-focus-ring mef-press block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold tracking-[0.08em] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-50"
              >
                {FPA_EXPERIMENT_START_LABEL}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push('/dashboard' as Route)}
                data-fpa-bottom-cta
                className="mef-focus-ring mef-press block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
              >
                {FPA_CONTINUE_LABEL}
              </button>
            )}
          </RevealOnScroll>
        </>
      )}
    </div>
  );
}
