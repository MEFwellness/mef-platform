'use client';

/** Favorite + add-to-pantry quick actions on the unified product result page — ties Part 4 (favorites) and Part 9 (pantry) into the one result screen every product (barcode/label/manual/search) renders through. */

import { useState, useTransition } from 'react';
import { Heart, Refrigerator } from 'lucide-react';
import { toggleFavoriteProductAction } from '@/app/actions/food-search';
import { addPantryItemFromProductAction } from '@/app/actions/pantry';

export function QuickProductActions({
  productId,
  initiallyFavorited,
}: {
  productId: string;
  initiallyFavorited: boolean;
}) {
  const [favorited, setFavorited] = useState(initiallyFavorited);
  const [pantryAdded, setPantryAdded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleFavorite() {
    setFavorited((prev) => !prev);
    startTransition(async () => {
      await toggleFavoriteProductAction(productId);
    });
  }

  function handleAddToPantry() {
    startTransition(async () => {
      const result = await addPantryItemFromProductAction({ productId });
      if (!result.error) setPantryAdded(true);
    });
  }

  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={handleFavorite}
        disabled={isPending}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[#1B3A2D]/15 py-2.5 text-xs font-semibold text-[#1B3A2D] disabled:opacity-60"
      >
        <Heart
          className={`h-3.5 w-3.5 ${favorited ? 'fill-[#1B3A2D]' : ''}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {favorited ? 'Favorited' : 'Favorite'}
      </button>
      <button
        type="button"
        onClick={handleAddToPantry}
        disabled={isPending || pantryAdded}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[#1B3A2D]/15 py-2.5 text-xs font-semibold text-[#1B3A2D] disabled:opacity-60"
      >
        <Refrigerator className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        {pantryAdded ? 'In pantry' : 'Add to pantry'}
      </button>
    </div>
  );
}
