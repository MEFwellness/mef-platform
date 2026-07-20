'use client';

import { useState } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ExerciseLibraryExercise } from '@mef/shared-types-contracts';
import { FavoriteButton } from './FavoriteButton';

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{value}</p>
    </div>
  );
}

function DetailList({ label, items }: { label: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{label}</p>
      <ul className="mt-1 list-inside list-disc space-y-1 text-sm leading-relaxed text-[#1B3A2D]">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function DetailOrderedList({ label, items }: { label: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{label}</p>
      <ol className="mt-1 list-inside list-decimal space-y-1 text-sm leading-relaxed text-[#1B3A2D]">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    </div>
  );
}

export function ExerciseDetailView({ exercise }: { exercise: ExerciseLibraryExercise }) {
  const [imageFailed, setImageFailed] = useState(false);
  const metadata = exercise.metadata;

  const regressions = metadata?.regressions.length ? metadata.regressions : exercise.variations;
  const progressions = metadata?.progressions.length ? metadata.progressions : [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
          {exercise.name}
        </h1>
        <FavoriteButton externalId={exercise.externalId} initialIsFavorited={exercise.isFavorited} />
      </div>

      <p className="text-xs text-[#6B7A72]">
        {[exercise.category, exercise.level, exercise.mechanic, exercise.force]
          .filter(Boolean)
          .join(' · ') || 'No category metadata returned'}
      </p>

      <div className="overflow-hidden rounded-2xl border border-[#1B3A2D]/10 bg-white">
        {exercise.videoUrl ? (
          <video
            key={exercise.videoUrl}
            src={exercise.videoUrl}
            controls
            playsInline
            className="max-h-96 w-full bg-black object-contain"
          />
        ) : exercise.imageUrl && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote CDN images from ExerciseAPI.dev; no next.config remote-pattern configured for a third-party content vendor's own CDN
          <img
            src={exercise.imageUrl}
            alt={exercise.name}
            onError={() => setImageFailed(true)}
            className="max-h-96 w-full object-contain"
          />
        ) : (
          <div className="px-4 py-10 text-center text-sm text-[#6B7A72]">
            No demo video or image available for this exercise.
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-[#1B3A2D]/10 bg-white p-5">
        <DetailField label="Equipment" value={exercise.equipment ?? 'None / bodyweight'} />
        <DetailList label="Primary muscles" items={exercise.primaryMuscles} />
        <DetailList label="Secondary muscles" items={exercise.secondaryMuscles} />
        {exercise.overview && <DetailField label="Overview" value={exercise.overview} />}
        <DetailOrderedList label="Instructions" items={exercise.instructions} />
        <DetailList label="Form tips" items={exercise.exerciseTips} />
        <DetailList
          label="Coaching cues"
          items={metadata?.coaching_cues.length ? metadata.coaching_cues : undefined}
        />
        <DetailList label="Common mistakes" items={exercise.commonMistakes} />
        {exercise.safetyInfo && <DetailField label="Safety information" value={exercise.safetyInfo} />}
        {metadata?.contraindications.length ? (
          <DetailList label="Contraindications" items={metadata.contraindications} />
        ) : null}

        {regressions.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              Regressions / variations
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {regressions.map((name) => (
                <Link
                  key={name}
                  href={`/exercises?q=${encodeURIComponent(name)}` as Route}
                  className="rounded-full border border-[#1B3A2D]/15 px-3 py-1 text-xs font-medium text-[#1B3A2D] hover:border-[#1B3A2D]/40"
                >
                  {name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {progressions.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              Progressions
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {progressions.map((name) => (
                <Link
                  key={name}
                  href={`/exercises?q=${encodeURIComponent(name)}` as Route}
                  className="rounded-full border border-[#1B3A2D]/15 px-3 py-1 text-xs font-medium text-[#1B3A2D] hover:border-[#1B3A2D]/40"
                >
                  {name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
