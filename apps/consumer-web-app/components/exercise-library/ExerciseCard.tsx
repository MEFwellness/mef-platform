'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { ExerciseLibraryExercise } from '@mef/shared-types-contracts';
import { FavoriteButton } from './FavoriteButton';
import { MediaBadge, MediaPlaceholder } from './MediaBadge';
import { HighlightMatch } from './HighlightMatch';

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/** One result in the Exercise Library grid. Media badge always tells the truth about what a member will see on tap — never a broken-image icon. Lazy-loaded images (native `loading="lazy"`) since a results grid can run to dozens of entries. */
export function ExerciseCard({
  exercise,
  highlight,
  animationDelayMs = 0,
}: {
  exercise: ExerciseLibraryExercise;
  /** The member's current search term, if any — bolds the matching substring in the exercise name so scanning results is faster. */
  highlight?: string;
  animationDelayMs?: number;
}) {
  const difficulty = exercise.level ? DIFFICULTY_LABEL[exercise.level] : null;
  const facts = [
    exercise.primaryMuscles[0]?.replace(/_/g, ' '),
    exercise.equipment,
    difficulty,
  ].filter(Boolean) as string[];

  return (
    <Link
      href={`/exercises/${encodeURIComponent(exercise.externalId)}` as Route}
      className="mef-focus-ring mef-animate-in group relative flex flex-col overflow-hidden rounded-2xl border border-[#1B3A2D]/10 bg-white transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#1B3A2D]/30 hover:shadow-[0_10px_28px_-8px_rgba(27,58,45,0.22)] active:scale-[0.98] active:duration-75"
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#EFF6F1]">
        {exercise.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote CDN images from ExerciseAPI.dev; no next.config remote-pattern configured for a third-party content vendor's own CDN
          <img
            src={exercise.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <MediaPlaceholder />
        )}

        <div className="absolute left-2 top-2">
          <MediaBadge exercise={exercise} />
        </div>
        <div className="absolute right-2 top-2">
          <FavoriteButton
            externalId={exercise.externalId}
            initialIsFavorited={exercise.isFavorited}
            exerciseName={exercise.name}
            size="sm"
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-[#1B3A2D]">
          {highlight ? <HighlightMatch text={exercise.name} query={highlight} /> : exercise.name}
        </p>
        {facts.length > 0 && (
          <p className="mt-auto truncate text-xs text-[#6B7A72]">{facts.join(' · ')}</p>
        )}
        {exercise.force && (
          <span className="w-fit rounded-full bg-[#EFF6F1] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#1B3A2D]/70">
            {exercise.force}
          </span>
        )}
      </div>
    </Link>
  );
}
