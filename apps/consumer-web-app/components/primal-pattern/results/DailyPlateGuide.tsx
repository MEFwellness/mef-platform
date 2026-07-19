'use client';

/**
 * Daily Plate Guide — members switch instantly between 3/4/5 meals a day.
 * Content comes entirely from DAILY_PLATE_GUIDE (lib/primal-pattern/
 * premium/content.ts), clearly labeled as an educational example per the
 * brief ("if final portion rules are unavailable..."). The meal list
 * re-triggers mef-animate-in via a `key` on the frequency, giving a
 * smooth swap instead of an abrupt content change.
 */

import { useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import {
  DAILY_PLATE_GUIDE,
  EDUCATIONAL_EXAMPLE_DISCLAIMER,
  MEAL_FREQUENCY_OPTIONS,
  type MealFrequencyOption,
} from '@/lib/primal-pattern/premium/content';

export function DailyPlateGuide({ defaultFrequency }: { defaultFrequency: MealFrequencyOption }) {
  const [frequency, setFrequency] = useState<MealFrequencyOption>(defaultFrequency);
  const meals = DAILY_PLATE_GUIDE[frequency];

  return (
    <section className="rounded-[32px] bg-white p-7 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] sm:p-8">
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <UtensilsCrossed className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Daily Plate Guide</p>
      </div>

      <div
        role="group"
        aria-label="Meals per day"
        className="mt-4 inline-flex rounded-2xl bg-[#F3F6F4] p-1"
      >
        {MEAL_FREQUENCY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={frequency === option}
            onClick={() => setFrequency(option)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-200 active:scale-95 motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] ${
              frequency === option
                ? 'bg-[#1B3A2D] text-white shadow-sm'
                : 'text-[#6B7A72] hover:text-[#1B3A2D]'
            }`}
          >
            {option} meals
          </button>
        ))}
      </div>

      <div key={frequency} className="mef-animate-in mt-5 space-y-3">
        {meals.map((meal) => (
          <div
            key={meal.label}
            className="rounded-2xl border border-[#EDEBE3] p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
          >
            <p className="text-sm font-semibold text-[#1B3A2D]">{meal.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-[#6B7A72] sm:mt-0 sm:text-right">
              {meal.proteinPortion} protein · {meal.fatPortion} fat · {meal.carbPortion}{' '}
              carbohydrate · {meal.vegetablePortion} vegetables
            </p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-[#6B7A72]">
        {EDUCATIONAL_EXAMPLE_DISCLAIMER}
      </p>
    </section>
  );
}
