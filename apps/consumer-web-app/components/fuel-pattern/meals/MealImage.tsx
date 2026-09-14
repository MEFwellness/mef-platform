'use client';

/**
 * The picture on a meal card, and what stands there before it arrives.
 *
 * =====================================================================
 * THERE IS NO GREY BOX, AT ANY POINT, FOR ANY MEAL.
 * =====================================================================
 *
 * The plate is drawn FIRST and always, in the brand palette, from this
 * meal's own three range words, so the space is a considered object from
 * the very first frame. The photograph then fades in over it when it has
 * loaded. That means one treatment covers three cases which would
 * otherwise each need their own:
 *
 *   - the moment before the photo has arrived,
 *   - a meal with no honest open-license photograph of it in existence,
 *   - a photo that fails to load on a bad connection.
 *
 * In all three she sees the same calm plate rather than a hole, and in
 * the third the card simply never changes rather than breaking.
 *
 * THE PLATE IS THIS MEAL'S OWN PROPORTIONS, not a generic mark. A meal
 * whose protein is Higher and whose carbohydrate is Lighter draws a plate
 * that looks like that, in the same language Question 24 used to ask her
 * about it. It is aria-hidden, because the card's own name and summary
 * already say what the meal is.
 */

import { useState } from 'react';
import { PlateIllustration, type PlateSlice } from '../PlateIllustration';
import type { FpaMeal, FpaRangeWord } from '@/lib/fuel-pattern/meals/types';

/** Relative weights the three range words carry when the plate is drawn. */
const WEIGHT: Record<FpaRangeWord, number> = {
  Higher: 3,
  Moderate: 2,
  Lighter: 1,
};

/**
 * This meal's plate. Vegetables take a fixed quarter on every plate,
 * because every meal in the library has them and none of the three range
 * words describes them, and the remaining three quarters are split in
 * proportion to the meal's own words.
 */
export function mealPlateShape(meal: FpaMeal): PlateSlice[] {
  const protein = WEIGHT[meal.protein];
  const carbohydrate = WEIGHT[meal.carbohydrate];
  const fat = WEIGHT[meal.fat];
  const total = protein + carbohydrate + fat;
  const remainder = 0.75;
  return [
    { component: 'protein', share: (protein / total) * remainder },
    { component: 'vegetables', share: 0.25 },
    { component: 'carbohydrate', share: (carbohydrate / total) * remainder },
    { component: 'fat', share: (fat / total) * remainder },
  ];
}

export const FPA_MEAL_IMAGE_BASE = '/images/fuel-meals';

export function MealImage({ meal }: { meal: FpaMeal }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = meal.image ? `${FPA_MEAL_IMAGE_BASE}/${meal.image}` : null;

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-[26px] bg-[#FAF7F0]">
      {/* The plate, always drawn, always underneath. */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-700 ease-out motion-reduce:transition-none ${
          loaded && !failed ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div
          className={`absolute inset-0 ${src && !failed && !loaded ? 'mef-settling' : ''}`}
          aria-hidden="true"
        />
        <PlateIllustration shape={mealPlateShape(meal)} size={112} />
      </div>

      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out motion-reduce:transition-none ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}
