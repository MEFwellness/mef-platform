'use client';

/**
 * My Meals.
 *
 * THE SAME CARD, MINUS THE THINGS A COLLECTION CANNOT DO. There is no
 * Show me another here, because there is nothing to rotate: this is not a
 * slot, it is what she kept. There is no I do not eat this either, for
 * the same reason. Save stays, and here it is the way out: tapping it
 * again removes the meal from the collection, and the card leaves.
 *
 * GROUPED BY THE PART OF THE DAY. Breakfast, lunch, dinner, snack, in
 * that order, and an empty group is not drawn at all.
 *
 * A RETAKE NEVER UNSAVES ANYTHING. A meal she kept under a reading she no
 * longer holds carries a quiet label saying which one, which is the
 * honest thing to do with it: it was a real choice she made, and the
 * pattern it belonged to is part of what it was.
 *
 * The unsave goes over the same route handler the result page uses, so
 * this screen does not re-render itself to record a tap either.
 */

import { useState } from 'react';
import {
  FPA_MEAL_TYPE_LABEL,
  FPA_MY_MEALS,
} from '@/lib/fuel-pattern/meals/copy';
import { fpaWhyItFits, type FpaSavedMealEntry } from '@/lib/fuel-pattern/meals/payload';
import { FPA_MEAL_TYPES, type FpaMealType } from '@/lib/fuel-pattern/meals/types';
import { MealCard } from './MealCard';

const GROUP_HEADER = 'text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7A72]';

export function SavedMealsView({ entries }: { entries: FpaSavedMealEntry[] }) {
  const [removed, setRemoved] = useState<string[]>([]);
  const visible = entries.filter((entry) => !removed.includes(entry.meal.id));

  function unsave(mealId: string) {
    setRemoved((current) => [...current, mealId]);
    void fetch('/api/fuel-pattern/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', mealId, saved: false }),
      keepalive: true,
    }).catch(() => {
      // The card has already left her screen. A failed delete means the
      // meal is still saved, and the next visit says so, which is the
      // honest outcome rather than a card that claims a state the rows
      // do not hold.
    });
  }

  if (visible.length === 0) {
    return (
      <section className="rounded-[28px] border border-[#1B3A2D]/8 bg-[#FFFDF8] p-7 text-center">
        <p className="text-[15px] leading-[1.7] text-[#3F5B50]">{FPA_MY_MEALS.empty}</p>
      </section>
    );
  }

  const groups = FPA_MEAL_TYPES.map((type: FpaMealType) => ({
    type,
    entries: visible.filter((entry) => entry.meal.type === type),
  })).filter((group) => group.entries.length > 0);

  return (
    <div className="space-y-7">
      {groups.map((group) => (
        <section key={group.type} aria-labelledby={`fpa-saved-${group.type}`}>
          <p id={`fpa-saved-${group.type}`} className={GROUP_HEADER}>
            {FPA_MEAL_TYPE_LABEL[group.type]}
          </p>
          <div className="mt-3 space-y-4">
            {group.entries.map((entry) => (
              <MealCard
                key={entry.meal.id}
                meal={entry.meal}
                whyItFits={fpaWhyItFits(entry.meal, entry.patternAtSave)}
                saved
                savedUnderPattern={entry.fromAnotherPattern ? entry.patternAtSave : null}
                onSave={() => unsave(entry.meal.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
