/**
 * Meal Examples — premium configurable cards. Driven entirely by
 * MEAL_EXAMPLES_BY_RESULT (lib/primal-pattern/premium/content.ts): the
 * markup never hardcodes "Breakfast"/"Lunch"/"Dinner" as anything other
 * than a rendered `slot` value, so a future result or an additional meal
 * slot is a config change, not a component change.
 */

import { ChefHat } from 'lucide-react';
import {
  EDUCATIONAL_EXAMPLE_DISCLAIMER,
  type MealExample,
} from '@/lib/primal-pattern/premium/content';

export function MealExampleCards({ meals }: { meals: MealExample[] }) {
  return (
    <section className="rounded-[32px] bg-white p-7 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] sm:p-8">
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <ChefHat className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Meal Examples</p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {meals.map((meal) => (
          <div key={meal.slot} className="rounded-2xl border border-[#EDEBE3] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8A6B0F]">
              {meal.slot}
            </p>
            <p className="mt-2 text-sm font-semibold leading-snug text-[#1B3A2D]">{meal.title}</p>
            <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">{meal.description}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-[#6B7A72]">
        {EDUCATIONAL_EXAMPLE_DISCLAIMER}
      </p>
    </section>
  );
}
