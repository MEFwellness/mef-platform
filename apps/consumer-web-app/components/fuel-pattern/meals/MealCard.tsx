'use client';

/**
 * One meal, as a card.
 *
 * =====================================================================
 * THE MESSAGE AND THE BUTTONS UNDER IT ARE ONE STATEMENT.
 * =====================================================================
 *
 * This card OFFERS something. So its actions are the ones an offer can
 * honestly carry: keep it (Save), see a different one (Show me another)
 * and decline it (I do not eat this). There is no Done and no I made
 * this, because nothing in the app records a meal being cooked and a
 * button that claimed otherwise would be writing a row nothing supports.
 * That is the standing rule from lib/priority/actions.ts, applied to a
 * different surface.
 *
 * =====================================================================
 * THE ONLY NUMBER ON IT IS THE PREPARATION TIME.
 * =====================================================================
 *
 * No calories, no grams, no percentages, nowhere. The three ranges are
 * words, the portions are described, and the prep time is drawn quietly
 * beside the meal type rather than as a claim. The card is used in three
 * places (the result page, My Meals, and a saved card) and the number is
 * made in one place, lib/fuel-pattern/meals/copy.ts.
 *
 * Premium per the brand system: warm tinted surface, refined hairline,
 * soft shadow, generous spacing, Cormorant Garamond on the name and DM
 * Sans on everything else.
 */

import { Bookmark, Check, Clock3, RefreshCw } from 'lucide-react';
import { CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import {
  FPA_MEAL_CARD_COPY,
  FPA_MEAL_TYPE_LABEL,
  FPA_MY_MEALS,
  FPA_WIDENED_NOTE,
  fpaPrepTimeLabel,
} from '@/lib/fuel-pattern/meals/copy';
import { FUEL_PATTERN_LABEL } from '@/lib/fuel-pattern/copy';
import type { FpaMeal } from '@/lib/fuel-pattern/meals/types';
import type { FuelPattern } from '@/lib/fuel-pattern/types';
import { MealImage } from './MealImage';

const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.2em] text-[#B89340]';
const SUB_HEADER = 'text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#6B7A72]';

export function MealCard({
  meal,
  whyItFits,
  saved,
  widened = false,
  savedUnderPattern = null,
  onSave,
  onAnother,
  onReject,
  busy = false,
}: {
  meal: FpaMeal;
  /** Already carries the Flexible Fuel sentence when it applies. */
  whyItFits: string;
  saved: boolean;
  /** True when this meal came from a neighbouring set because hers held nothing she eats. */
  widened?: boolean;
  /**
   * Set only in My Meals, and only for a meal saved under a reading she
   * no longer holds. A retake never unsaves anything, so the label is how
   * the card stays honest about where the meal came from.
   */
  savedUnderPattern?: FuelPattern | null;
  onSave: () => void;
  /** Absent in My Meals: there is nothing to rotate in a collection. */
  onAnother?: () => void;
  onReject?: () => void;
  busy?: boolean;
}) {
  return (
    <article
      data-fpa-meal-id={meal.id}
      data-fpa-meal-type={meal.type}
      className="overflow-hidden rounded-[28px] border border-[#1B3A2D]/8 bg-[#FFFDF8] shadow-[0_14px_40px_-28px_rgba(27,58,45,0.55)]"
    >
      <MealImage meal={meal} />

      <div className="p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className={EYEBROW}>{FPA_MEAL_TYPE_LABEL[meal.type]}</p>
          <p
            data-fpa-prep
            className="flex items-center gap-1 text-[12px] text-[#9AA79F]"
          >
            <Clock3 className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
            {fpaPrepTimeLabel(meal.prepMinutes)}
          </p>
        </div>

        <h3 className={`${CVS_DISPLAY_FONT} mt-2 text-[26px] leading-[1.15] text-[#1B3A2D]`}>
          {meal.name}
        </h3>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[#3F5B50]">{meal.summary}</p>

        {savedUnderPattern && (
          <p className="mt-3 inline-flex rounded-full bg-[#F3F6F4] px-3 py-1 text-[11.5px] text-[#6B7A72]">
            {FPA_MY_MEALS.patternLabelPrefix} {FUEL_PATTERN_LABEL[savedUnderPattern]}{' '}
            {FPA_MY_MEALS.patternLabelSuffix}
          </p>
        )}

        <div className="mt-5 rounded-2xl bg-[#F3F6F4] p-4">
          <p className={SUB_HEADER}>{FPA_MEAL_CARD_COPY.whyHeader}</p>
          <p className="mt-2 text-[14.5px] leading-[1.7] text-[#1B3A2D]">{whyItFits}</p>
        </div>

        {widened && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-[#6B7A72]">{FPA_WIDENED_NOTE}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            aria-pressed={saved}
            data-fpa-save
            className={`mef-focus-ring mef-press inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold transition ${
              saved
                ? 'bg-[#C4A050] text-[#1B3A2D]'
                : 'border border-[#1B3A2D]/15 bg-white text-[#1B3A2D] hover:border-[#C4A050]/60'
            }`}
          >
            {saved ? (
              <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            )}
            {saved ? FPA_MEAL_CARD_COPY.saved : FPA_MEAL_CARD_COPY.save}
          </button>

          {onAnother && (
            <button
              type="button"
              onClick={onAnother}
              disabled={busy}
              data-fpa-another
              className="mef-focus-ring mef-press inline-flex items-center gap-1.5 rounded-full border border-[#1B3A2D]/15 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#1B3A2D] transition hover:border-[#C4A050]/60 disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {FPA_MEAL_CARD_COPY.another}
            </button>
          )}
        </div>

        {onReject && (
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            data-fpa-reject
            className="mef-focus-ring mt-3 text-[12.5px] font-medium text-[#6B7A72] underline decoration-[#6B7A72]/30 underline-offset-4 transition hover:text-[#1B3A2D] disabled:opacity-60"
          >
            {FPA_MEAL_CARD_COPY.reject}
          </button>
        )}
      </div>
    </article>
  );
}
