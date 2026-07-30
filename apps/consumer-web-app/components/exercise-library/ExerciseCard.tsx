'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { PlayCircle } from 'lucide-react';
import type { ExerciseLibraryExercise } from '@mef/shared-types-contracts';
import { FavoriteButton } from './FavoriteButton';
import { MediaBadge, CuesPlaceholder } from './MediaBadge';
import { VideoPosterPlaceholder } from './VideoPosterPlaceholder';
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
    exercise.primaryMuscle?.replace(/_/g, ' '),
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
        {exercise.hasVideo ? (
          <>
            {exercise.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- our own extracted-frame poster, stored in the exercise-media Supabase bucket, never the vendor's own CDN
              <img
                src={exercise.posterUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              // Poster extraction hasn't run for this exercise yet — branded
              // placeholder instead of a blank gray box. Disappears on its
              // own, per-exercise, the moment posterUrl is populated.
              <VideoPosterPlaceholder exercise={exercise} />
            )}
            {/* Tap-to-play affordance only — the grid never renders a <video> element or requests a video URL, so browsing never touches Your Move's metered endpoint. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
              <PlayCircle className="h-10 w-10 text-white drop-shadow" strokeWidth={1.5} />
            </div>
          </>
        ) : (
          <CuesPlaceholder cues={exercise.cues} />
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
      </div>
    </Link>
  );
}
