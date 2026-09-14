'use client';

/**
 * My Fuel Experiment, her own screen.
 *
 * =====================================================================
 * THE SAME FOUR STATES, DRAWN BY THE SAME COMPONENT.
 * =====================================================================
 *
 * Not started, active, complete and put away are the four things a run
 * can be, and FuelExperimentBody is the one place they are written. This
 * screen draws that body under its own heading and adds the one thing
 * the result page deliberately does not carry: the list of what she has
 * actually noticed. A second copy of the four states here would be a
 * second answer to "which day is she on", which is exactly the rule this
 * app keeps.
 *
 * WHY IT LIVES UNDER FOOD LENS. The same reason My Meals does: that is
 * where her food collections already are, and a fifth bottom-nav item on
 * every screen in the app would be an advertisement for one feature.
 *
 * READ ONLY ON ARRIVAL. Opening this page starts nothing and
 * acknowledges nothing. Every row behind it exists because she tapped
 * something.
 */

import { formatDisplayDate } from '@/lib/time/displayDate';
import { CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import {
  FPA_CHECK_MEAL_TYPE_LABEL,
  FPA_CLARITY_LABEL,
  FPA_ENERGY_LABEL,
  FPA_HUNGER_LABEL,
  FPA_MY_EXPERIMENT,
} from '@/lib/fuel-pattern/experiment/copy';
import type { FpaExperimentPayload } from '@/lib/fuel-pattern/experiment/payload';
import type { FpaExperimentCheck } from '@/lib/fuel-pattern/experiment/types';
import type { FpaMealType } from '@/lib/fuel-pattern/meals/types';
import { FuelExperimentBody } from './FuelExperimentSection';
import { useFuelExperiment } from './useFuelExperiment';

const SECTION_HEADER = 'text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7A72]';

export function MyExperimentView({
  payload,
  /** The names of the meals she has tagged, so a check can say which one. */
  mealNames,
}: {
  payload: FpaExperimentPayload;
  mealNames: Record<string, string>;
}) {
  const state = useFuelExperiment(payload);
  const checks = state.run ? [...state.run.checks].reverse() : [];

  return (
    <>
      <section className="rounded-[28px] border border-[#1B3A2D]/8 bg-[#FFFDF8] p-6 shadow-[0_2px_24px_-8px_rgba(27,58,45,0.18)] sm:p-7">
        <FuelExperimentBody state={state} taggableMeals={payload.taggableMeals} />
      </section>

      {state.run && (
        <section className="mt-5 rounded-[28px] border border-[#1B3A2D]/8 bg-[#F3F6F4] p-6 sm:p-7">
          <p className={SECTION_HEADER}>{FPA_MY_EXPERIMENT.logHeader}</p>
          {checks.length === 0 ? (
            <p className="mt-4 text-[14.5px] leading-relaxed text-[#3F5B50]">
              {FPA_MY_EXPERIMENT.logEmpty}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#1B3A2D]/8">
              {checks.map((check) => (
                <CheckRow key={check.id} check={check} mealNames={mealNames} />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function CheckRow({
  check,
  mealNames,
}: {
  check: FpaExperimentCheck;
  mealNames: Record<string, string>;
}) {
  /* A BARE YYYY-MM-DD, THROUGH THE ONE FORMATTER THAT KNOWS WHAT THAT
     MEANS. It is already her own calendar day, written by the server from
     her timezone, so it is never re-read through a second zone. */
  const day = formatDisplayDate(check.loggedOn, { month: 'short', day: 'numeric' });
  const tag = check.mealId
    ? mealNames[check.mealId] ?? null
    : check.mealType
      ? FPA_CHECK_MEAL_TYPE_LABEL[check.mealType as FpaMealType]
      : null;

  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className={`${CVS_DISPLAY_FONT} text-[17px] leading-tight text-[#1B3A2D]`}>{day}</p>
        {tag && <p className="shrink-0 text-[12.5px] text-[#6B7A72]">{tag}</p>}
      </div>
      <p className="mt-1 text-[14px] leading-relaxed text-[#3F5B50]">
        {FPA_ENERGY_LABEL[check.energy]}, {FPA_HUNGER_LABEL[check.hunger].toLowerCase()},{' '}
        {FPA_CLARITY_LABEL[check.clarity].toLowerCase()}
      </p>
    </li>
  );
}
