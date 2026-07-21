'use client';

import { useState, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { toggleExerciseFavorite } from '@/app/actions/exercise-library';

/**
 * Optimistic favorite toggle — flips immediately, reverts if the server
 * action reports failure. Used from both the results grid and the detail
 * page, same externalId/isFavorited contract either place. The visible
 * hit target stays a compact circle (so it doesn't dominate a card), but
 * the tappable area is padded out to the 44px minimum touch target via
 * `min-h`/`min-w` on the button itself, which is larger than its visual
 * background — accessible without changing how the badge looks.
 */
export function FavoriteButton({
  externalId,
  initialIsFavorited,
  exerciseName,
  size = 'md',
}: {
  externalId: string;
  initialIsFavorited: boolean;
  exerciseName?: string;
  size?: 'sm' | 'md';
}) {
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const [justToggled, setJustToggled] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !isFavorited;
    setIsFavorited(next);
    if (next) {
      setJustToggled(true);
      setTimeout(() => setJustToggled(false), 400);
    }
    startTransition(async () => {
      const result = await toggleExerciseFavorite(externalId, next, exerciseName);
      if (result.error) setIsFavorited(!next);
    });
  }

  const dimension = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={isFavorited}
      aria-label={
        isFavorited
          ? `Remove ${exerciseName ?? 'exercise'} from favorites`
          : `Add ${exerciseName ?? 'exercise'} to favorites`
      }
      className="mef-focus-ring flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-60"
    >
      <span
        className={`flex ${dimension} items-center justify-center rounded-full bg-white/90 shadow-sm transition hover:scale-105 ${justToggled ? 'mef-pop-in' : ''}`}
      >
        <Heart
          className={`${iconSize} ${isFavorited ? 'fill-[#F5B700] text-[#F5B700]' : 'text-[#6B7A72]'}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}
