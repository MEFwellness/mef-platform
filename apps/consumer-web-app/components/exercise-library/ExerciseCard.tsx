'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { PlayCircle } from 'lucide-react';
import type { ExerciseLibraryExercise } from '@mef/shared-types-contracts';
import { FavoriteButton } from './FavoriteButton';

/** One result in the Exercise Library grid — image/video badge, name, and the category/level/equipment metadata a member scans while browsing. Lazy-loaded images (native `loading="lazy"`) since a results grid can run to dozens of entries. */
export function ExerciseCard({ exercise }: { exercise: ExerciseLibraryExercise }) {
  const meta = [exercise.category, exercise.level, exercise.equipment].filter(Boolean).join(' · ');

  return (
    <Link
      href={`/exercises/${encodeURIComponent(exercise.externalId)}` as Route}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#1B3A2D]/10 bg-white transition hover:border-[#1B3A2D]/30 hover:shadow-[0_4px_20px_-6px_rgba(27,58,45,0.18)]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#EFF6F1]">
        {exercise.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote CDN images from ExerciseAPI.dev; no next.config remote-pattern configured for a third-party content vendor's own CDN
          <img
            src={exercise.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[#6B7A72]">
            No preview
          </div>
        )}
        {exercise.videoUrl && (
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#1B3A2D]/80 text-white">
            <PlayCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </span>
        )}
        <div className="absolute left-2 top-2">
          <FavoriteButton
            externalId={exercise.externalId}
            initialIsFavorited={exercise.isFavorited}
            size="sm"
          />
        </div>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-medium text-[#1B3A2D]">{exercise.name}</p>
        {meta && <p className="mt-0.5 truncate text-xs text-[#6B7A72]">{meta}</p>}
      </div>
    </Link>
  );
}
