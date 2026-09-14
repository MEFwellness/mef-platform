'use client';

/**
 * MEALS BUILT FOR YOUR PATTERN, and everything she can do to them.
 *
 * =====================================================================
 * IT CANNOT BOUNCE THE PAGE IT SITS ON.
 * =====================================================================
 *
 * This section joins a result page whose whole design is that nothing
 * behind it can replace it: no fetch, no Server Action, no router call.
 * So every single thing here obeys the same rule.
 *
 *   - EVERY MEAL IT COULD EVER SHOW IS ALREADY IN ITS PROPS. Her own six
 *     per slot and the neighbouring sets came down with the page, so a
 *     replacement is chosen from memory rather than fetched.
 *   - THE PICKER IS THE SERVER'S OWN PICKER. pickSlotMeal is pure and
 *     this file calls the same function the server called, so a card
 *     chosen in her browser is the card the server would have chosen.
 *   - THE SERVER IS TOLD AFTERWARDS, OVER A ROUTE HANDLER. A few bytes
 *     of JSON, sent with keepalive so leaving the page does not cancel
 *     it, and nothing waits on the reply before the screen moves.
 *   - NOTHING IS WRITTEN ON MOUNT. The first four cards are chosen
 *     deterministically from rows that already exist, so opening the
 *     page and choosing nothing leaves no trace. A render never decides
 *     anything.
 *
 * =====================================================================
 * A STANDING PREFERENCE APPLIES EVERYWHERE, IMMEDIATELY.
 * =====================================================================
 *
 * When she records No dairy on a breakfast card, the other three slots
 * are re-checked in the same tick and any of them holding a dairy meal
 * swaps too. It would be strange to say "dairy is off your cards from
 * here" and leave one sitting further down the same screen.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronRight } from 'lucide-react';
import { RevealOnScroll } from '@/components/dashboard/RevealOnScroll';
import {
  FPA_EMPTY_SLOT_LINE,
  FPA_MEALS_SECTION_HEADER,
  FPA_MEALS_SECTION_LEAD,
  FPA_MEAL_TYPE_LABEL,
  FPA_MY_MEALS,
  FPA_REASON_CONFIRMATION,
  FPA_REJECTION_RECORDED_LINE,
} from '@/lib/fuel-pattern/meals/copy';
import { fpaWhyItFits, type FpaMealsPayload } from '@/lib/fuel-pattern/meals/payload';
import {
  exclusionForAllergen,
  exclusionForReason,
  mealSatisfiesExclusion,
  type FpaExclusionKey,
} from '@/lib/fuel-pattern/meals/preferences';
import { pickSlotMeal, type FpaMealFilter, type FpaSlotState } from '@/lib/fuel-pattern/meals/selection';
import type { FpaMeal, FpaMealType } from '@/lib/fuel-pattern/meals/types';
import { MealCard } from './MealCard';
import { MealReasonSheet, type MealReasonAnswer } from './MealReasonSheet';

const SECTION_HEADER = 'text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7A72]';

const MEALS_ENDPOINT = '/api/fuel-pattern/meals';

/** Fire and forget. The screen has already moved; this only records it. */
function post(body: Record<string, unknown>): void {
  void fetch(MEALS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {
    // A failed record leaves her screen correct and the row unwritten.
    // The next visit recomputes from what did land, which is the honest
    // outcome and never a wrong card.
  });
}

type SlotView = {
  state: FpaSlotState;
  mealId: string | null;
  widened: boolean;
  /** The quiet line under a card after she has told us something. */
  note: string | null;
};

export function FuelMealsSection({ payload }: { payload: FpaMealsPayload }) {
  const [rejected, setRejected] = useState<string[]>(payload.rejectedMealIds);
  const [exclusions, setExclusions] = useState<FpaExclusionKey[]>(payload.exclusions);
  const [saved, setSaved] = useState<string[]>(payload.savedMealIds);
  const [sheet, setSheet] = useState<{ meal: FpaMeal; type: FpaMealType } | null>(null);

  const [slots, setSlots] = useState<Record<FpaMealType, SlotView>>(() => {
    const initial = {} as Record<FpaMealType, SlotView>;
    for (const slot of payload.slots) {
      initial[slot.type] = {
        state: slot.state,
        mealId: slot.mealId,
        widened: slot.widened,
        note: null,
      };
    }
    return initial;
  });

  const pools = useMemo(() => {
    const byType = {} as Record<FpaMealType, { own: FpaMeal[]; wider: FpaMeal[] }>;
    for (const slot of payload.slots) {
      byType[slot.type] = { own: slot.ownPool, wider: slot.widerPool };
    }
    return byType;
  }, [payload.slots]);

  const mealById = useMemo(() => {
    const map = new Map<string, FpaMeal>();
    for (const slot of payload.slots) {
      for (const meal of [...slot.ownPool, ...slot.widerPool]) map.set(meal.id, meal);
    }
    return map;
  }, [payload.slots]);

  /**
   * Move one slot on, under the filter it is given, and tell the server.
   *
   * CALLED OUTSIDE THE STATE UPDATER, ALWAYS. React may run an updater
   * twice in development, and this function posts, so running it inside
   * one would record the same swap twice.
   */
  const advanceSlot = useCallback(
    (
      type: FpaMealType,
      filter: FpaMealFilter,
      current: SlotView,
      note: string | null
    ): SlotView => {
      const pool = pools[type];
      const pick = pickSlotMeal({
        ownPool: pool.own,
        widerPool: pool.wider,
        filter,
        state: current.state,
        advance: true,
      });
      post({
        action: 'slot',
        mealType: type,
        pattern: payload.pattern,
        currentMealId: pick.state.currentMealId,
        shownMealIds: pick.state.shownMealIds,
      });
      return { state: pick.state, mealId: pick.meal?.id ?? null, widened: pick.widened, note };
    },
    [payload.pattern, pools]
  );

  const onAnother = useCallback(
    (type: FpaMealType) => {
      const next = advanceSlot(type, { rejectedMealIds: rejected, exclusions }, slots[type], null);
      setSlots((current) => ({ ...current, [type]: next }));
    },
    [advanceSlot, exclusions, rejected, slots]
  );

  /**
   * She does not eat this one. The card moves first and the record
   * follows, because the tap is the whole answer and the sheet is extra.
   */
  const onReject = useCallback(
    (type: FpaMealType, meal: FpaMeal) => {
      const nextRejected = rejected.includes(meal.id) ? rejected : [...rejected, meal.id];
      setRejected(nextRejected);
      post({ action: 'reject', mealId: meal.id, reason: null });
      const next = advanceSlot(
        type,
        { rejectedMealIds: nextRejected, exclusions },
        slots[type],
        FPA_REJECTION_RECORDED_LINE
      );
      setSlots((current) => ({ ...current, [type]: next }));
      setSheet({ meal, type });
    },
    [advanceSlot, exclusions, rejected, slots]
  );

  /** Her reason, when she gave one. A standing one re-checks every slot. */
  const onReasonAnswer = useCallback(
    (answer: MealReasonAnswer) => {
      const open = sheet;
      setSheet(null);
      if (!open) return;

      post({
        action: 'reject',
        mealId: open.meal.id,
        reason: answer.reason,
        note: answer.note,
        allergens: answer.allergens,
      });

      const added: FpaExclusionKey[] = [];
      const dietary = exclusionForReason(answer.reason);
      if (dietary) added.push(dietary);
      if (answer.reason === 'allergy') {
        for (const allergen of answer.allergens) added.push(exclusionForAllergen(allergen));
      }

      const note = FPA_REASON_CONFIRMATION[answer.reason];

      if (added.length === 0) {
        setSlots((current) => ({
          ...current,
          [open.type]: { ...current[open.type], note },
        }));
        return;
      }

      const nextExclusions = [...new Set([...exclusions, ...added])];
      setExclusions(nextExclusions);

      // EVERY SLOT IS RE-CHECKED, NOT JUST THE ONE SHE WAS LOOKING AT.
      // Saying "dairy is off your cards from here" and leaving a dairy
      // meal two cards further down the same screen would be false.
      const filter: FpaMealFilter = { rejectedMealIds: rejected, exclusions: nextExclusions };
      const next = { ...slots };
      for (const slot of payload.slots) {
        const view = slots[slot.type];
        const noteForSlot = slot.type === open.type ? note : view.note;
        const showing = view.mealId ? mealById.get(view.mealId) ?? null : null;
        const stillAllowed =
          showing !== null &&
          !filter.rejectedMealIds.includes(showing.id) &&
          added.every((key) => mealSatisfiesExclusion(showing, key));
        next[slot.type] = stillAllowed
          ? { ...view, note: noteForSlot }
          : advanceSlot(slot.type, filter, view, noteForSlot);
      }
      setSlots(next);
    },
    [advanceSlot, exclusions, mealById, payload.slots, rejected, sheet, slots]
  );

  const onSave = useCallback(
    (meal: FpaMeal) => {
      const isSaved = saved.includes(meal.id);
      setSaved(isSaved ? saved.filter((id) => id !== meal.id) : [...saved, meal.id]);
      post({
        action: 'save',
        mealId: meal.id,
        pattern: payload.pattern,
        saved: !isSaved,
      });
    },
    [payload.pattern, saved]
  );

  return (
    <>
      <RevealOnScroll className="mt-5" delayMs={60}>
        <section
          aria-labelledby="fpa-meals-header"
          className="rounded-[28px] border border-[#1B3A2D]/8 bg-[#F7F3EA] p-6 sm:p-7"
        >
          <p id="fpa-meals-header" className={SECTION_HEADER}>
            {FPA_MEALS_SECTION_HEADER}
          </p>
          <p className="mt-4 text-[15px] leading-[1.7] text-[#1B3A2D]">
            {FPA_MEALS_SECTION_LEAD}
          </p>

          <div className="mt-5 space-y-4">
            {payload.slots.map((slot) => {
              const view = slots[slot.type];
              const meal = view.mealId ? mealById.get(view.mealId) ?? null : null;

              if (!meal) {
                return (
                  <div
                    key={slot.type}
                    data-fpa-meal-type={slot.type}
                    className="rounded-[28px] border border-[#1B3A2D]/8 bg-[#FFFDF8] p-6"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#B89340]">
                      {FPA_MEAL_TYPE_LABEL[slot.type]}
                    </p>
                    <p className="mt-3 text-[14.5px] leading-relaxed text-[#3F5B50]">
                      {FPA_EMPTY_SLOT_LINE}
                    </p>
                  </div>
                );
              }

              return (
                <div key={slot.type}>
                  <MealCard
                    meal={meal}
                    whyItFits={fpaWhyItFits(meal, payload.pattern)}
                    saved={saved.includes(meal.id)}
                    widened={view.widened}
                    onSave={() => onSave(meal)}
                    onAnother={() => onAnother(slot.type)}
                    onReject={() => onReject(slot.type, meal)}
                  />
                  {view.note && (
                    <p
                      role="status"
                      className="mt-2 px-2 text-[12.5px] leading-relaxed text-[#6B7A72]"
                    >
                      {view.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <Link
            href={'/food-lens/my-meals' as Route}
            className="mef-focus-ring mef-press mt-5 flex items-center justify-between rounded-2xl border border-[#1B3A2D]/10 bg-[#FFFDF8] px-5 py-4 text-[14px] font-semibold text-[#1B3A2D] transition hover:border-[#C4A050]/50"
          >
            {FPA_MY_MEALS.link}
            <ChevronRight className="h-4 w-4 text-[#9AA79F]" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </section>
      </RevealOnScroll>

      {sheet && (
        <MealReasonSheet
          meal={sheet.meal}
          onAnswer={onReasonAnswer}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
