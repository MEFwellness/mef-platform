'use client';

import { useState, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { toggleExerciseFavorite } from '@/app/actions/exercise-library';

/** Optimistic favorite toggle — flips immediately, reverts if the server action reports failure. Used from both the results grid and the detail page, same externalId/isFavorited contract either place. */
export function FavoriteButton({
  externalId,
  initialIsFavorited,
  size = 'md',
}: {
  externalId: string;
  initialIsFavorited: boolean;
  size?: 'sm' | 'md';
}) {
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !isFavorited;
    setIsFavorited(next);
    startTransition(async () => {
      const result = await toggleExerciseFavorite(externalId, next);
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
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      className={`flex ${dimension} shrink-0 items-center justify-center rounded-full bg-white/90 shadow-sm transition hover:scale-105 disabled:opacity-60`}
    >
      <Heart
        className={`${iconSize} ${isFavorited ? 'fill-[#F5B700] text-[#F5B700]' : 'text-[#6B7A72]'}`}
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </button>
  );
}
