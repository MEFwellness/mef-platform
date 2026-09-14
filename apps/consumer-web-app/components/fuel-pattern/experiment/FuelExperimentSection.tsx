'use client';

/**
 * YOUR 7-DAY FUEL EXPERIMENT, on her result page.
 *
 * =====================================================================
 * THE ONE PLACE THE ARC CLOSES.
 * =====================================================================
 *
 * The four sections above this one are a hypothesis: a reading, a range,
 * a plate and four meals drawn from all three. This section is how it
 * gets tested, and the section BELOW it now says so. That is the whole
 * of Build 4 from a member's point of view.
 *
 * =====================================================================
 * FOUR STATES, AND EACH ONE IS THE WHOLE SECTION.
 * =====================================================================
 *
 *   not started  the invitation and START MY EXPERIMENT
 *   active       Day N of 7, what she has logged, LOG A CHECK
 *   complete     the week, noticed, assembled from her real rows, DONE
 *   put away     one quiet line and RESTART EXPERIMENT
 *
 * There is no fifth, and none of them is a placeholder: an empty card
 * promising something later is the thing Build 2 refused to draw.
 *
 * =====================================================================
 * IT CANNOT BOUNCE THE PAGE IT SITS ON.
 * =====================================================================
 *
 * Every tap here goes to a route handler and comes back as JSON. No
 * Server Action, no router call, no revalidation, and nothing at all
 * runs on mount. See useFuelExperiment.ts.
 *
 * DIGITS. This is the one section of this instrument that prints a
 * number, because a seven day experiment cannot say which day she is on
 * in words without being coy. Every node that carries one is marked
 * data-fpa-digits, and the result page's own guard reads the page with
 * those nodes removed and still requires no digit anywhere else.
 */

import { useState } from 'react';
import { RevealOnScroll } from '@/components/dashboard/RevealOnScroll';
import { CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import {
  FPA_EXPERIMENT_ACTIVE_LEAD,
  FPA_EXPERIMENT_COMPLETED_QUIET,
  FPA_EXPERIMENT_COMPLETION,
  FPA_EXPERIMENT_DONE_LABEL,
  FPA_EXPERIMENT_HEADER,
  FPA_EXPERIMENT_INVITATION,
  FPA_EXPERIMENT_LOG_LABEL,
  FPA_EXPERIMENT_RESTART_LABEL,
  FPA_EXPERIMENT_START_LABEL,
  fpaExperimentCheckLine,
  fpaExperimentCompletionCheckLine,
  fpaExperimentDayLine,
} from '@/lib/fuel-pattern/experiment/copy';
import type { FpaTaggableMeal } from '@/lib/fuel-pattern/experiment/payload';
import { InsightCard } from './InsightCard';
import { QuickCheckSheet } from './QuickCheckSheet';
import type { FuelExperimentState } from './useFuelExperiment';

const SECTION_HEADER = 'text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7A72]';

const PRIMARY =
  'mef-focus-ring mef-press mt-5 block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold tracking-[0.08em] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-50';

const SECONDARY =
  'mef-focus-ring mef-press mt-4 block w-full rounded-2xl border border-[#1B3A2D]/15 bg-transparent px-6 py-3.5 text-center text-sm font-semibold tracking-[0.08em] text-[#1B3A2D] transition hover:border-[#C4A050]/60 hover:bg-[#FDF9EF] disabled:opacity-50';

export function FuelExperimentSection({
  state,
  taggableMeals,
}: {
  state: FuelExperimentState;
  taggableMeals: FpaTaggableMeal[];
}) {
  return (
    <RevealOnScroll className="mt-5" delayMs={60}>
      <section
        aria-labelledby="fpa-experiment-header"
        data-fpa-experiment
        className="rounded-[28px] border border-[#1B3A2D]/8 bg-[#FFFDF8] p-6 shadow-[0_2px_24px_-8px_rgba(27,58,45,0.18)] sm:p-7"
      >
        <p id="fpa-experiment-header" className={SECTION_HEADER} data-fpa-digits>
          {FPA_EXPERIMENT_HEADER}
        </p>
        <FuelExperimentBody state={state} taggableMeals={taggableMeals} />
      </section>
    </RevealOnScroll>
  );
}

/**
 * The body, without the frame, so her own experiment screen can draw the
 * same four states under its own heading rather than owning a second
 * copy of them. One source of truth per statement.
 */
export function FuelExperimentBody({
  state,
  taggableMeals,
}: {
  state: FuelExperimentState;
  taggableMeals: FpaTaggableMeal[];
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { run, status, dayNumber, checkCount, insight, busy, error } = state;

  return (
    <>
      {!run || status === 'archived' ? (
        <>
          <p className="mt-4 text-[15px] leading-[1.7] text-[#1B3A2D]" data-fpa-digits>
            {FPA_EXPERIMENT_INVITATION}
          </p>
          <button type="button" onClick={state.start} disabled={busy} className={PRIMARY}>
            {FPA_EXPERIMENT_START_LABEL}
          </button>
        </>
      ) : status === 'active' ? (
        <>
          <p
            className={`${CVS_DISPLAY_FONT} mt-4 text-[30px] leading-none text-[#1B3A2D]`}
            data-fpa-digits
            data-fpa-experiment-day
          >
            {fpaExperimentDayLine(dayNumber)}
          </p>
          <p
            className="mt-2.5 text-[14.5px] leading-relaxed text-[#3F5B50]"
            data-fpa-digits
            data-fpa-experiment-count
          >
            {fpaExperimentCheckLine(checkCount)}
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[#6B7A72]">
            {FPA_EXPERIMENT_ACTIVE_LEAD}
          </p>

          {insight && <InsightCard insight={insight} />}

          <button type="button" onClick={() => setSheetOpen(true)} className={PRIMARY}>
            {FPA_EXPERIMENT_LOG_LABEL}
          </button>
        </>
      ) : run.acknowledged ? (
        /* Put away. One line, and the way back in. */
        <>
          <p className="mt-4 text-[15px] leading-[1.7] text-[#3F5B50]">
            {FPA_EXPERIMENT_COMPLETED_QUIET}
          </p>
          <button type="button" onClick={state.restart} disabled={busy} className={SECONDARY}>
            {FPA_EXPERIMENT_RESTART_LABEL}
          </button>
        </>
      ) : (
        /* The week, noticed. Every line of it is her own data or approved copy. */
        <>
          <h3
            className={`${CVS_DISPLAY_FONT} mt-4 text-[28px] leading-tight text-[#1B3A2D]`}
            data-fpa-experiment-completion
          >
            {FPA_EXPERIMENT_COMPLETION.header}
          </h3>
          <p
            className="mt-4 text-[15px] leading-[1.7] text-[#1B3A2D]"
            data-fpa-digits
            data-fpa-experiment-count
          >
            {fpaExperimentCompletionCheckLine(checkCount)}
          </p>
          {insight ? (
            <InsightCard insight={insight} />
          ) : (
            <p className="mt-4 text-[15px] leading-[1.7] text-[#1B3A2D]">
              {FPA_EXPERIMENT_COMPLETION.noInsightLine}
            </p>
          )}
          <p className="mt-4 text-[15px] leading-[1.7] text-[#1B3A2D]">
            {FPA_EXPERIMENT_COMPLETION.closingLine}
          </p>
          <button type="button" onClick={state.acknowledge} disabled={busy} className={PRIMARY}>
            {FPA_EXPERIMENT_DONE_LABEL}
          </button>
        </>
      )}

      {error && (
        <p role="status" className="mt-3 text-[12.5px] leading-relaxed text-[#6B7A72]">
          {error}
        </p>
      )}

      {sheetOpen && (
        <QuickCheckSheet
          taggableMeals={taggableMeals}
          onAnswer={state.logCheck}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
