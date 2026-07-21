'use client';

import { useState } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import { Share2, Check } from 'lucide-react';
import type {
  ExerciseLibraryExercise,
  MemberExerciseCompletion,
  MemberExerciseRecentView,
} from '@mef/shared-types-contracts';
import { FavoriteButton } from './FavoriteButton';
import { ExerciseCompletionControls } from './ExerciseCompletionControls';
import { ExerciseHistoryList } from './ExerciseHistoryList';
import { MediaBadge, MediaPlaceholder } from './MediaBadge';

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

/** Native share sheet when available (mobile Safari/Chrome); falls back to copying the exercise's URL to the clipboard everywhere else, with a brief "Copied" confirmation — never a silent no-op. */
function ShareButton({ exerciseName }: { exerciseName: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const shareData = {
      title: exerciseName,
      text: `${exerciseName} — MEF Wellness Exercise Library`,
      url,
    };

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // Member cancelled the share sheet or it failed — fall through to
        // the clipboard fallback rather than leaving the tap feeling dead.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied — nothing further to do; the member
      // can still copy the URL from the address bar themselves.
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="Share this exercise"
      className="mef-focus-ring flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#6B7A72] shadow-sm transition hover:scale-105 hover:text-[#1B3A2D]">
        {copied ? (
          <Check className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Share2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

function RelatedChip({ exercise }: { exercise: ExerciseLibraryExercise }) {
  return (
    <Link
      href={`/exercises/${encodeURIComponent(exercise.externalId)}` as Route}
      className="mef-focus-ring flex w-40 shrink-0 flex-col gap-1.5 rounded-2xl border border-[#1B3A2D]/10 bg-white p-3 transition hover:border-[#1B3A2D]/30 hover:shadow-[0_6px_18px_-6px_rgba(27,58,45,0.18)]"
    >
      <div className="flex items-center justify-between">
        <MediaBadge exercise={exercise} />
      </div>
      <p className="line-clamp-2 text-xs font-semibold leading-snug text-[#1B3A2D]">
        {exercise.name}
      </p>
    </Link>
  );
}

export function ExerciseDetailView({
  exercise,
  history = [],
  relatedExercises = [],
  recentlyViewed = [],
}: {
  exercise: ExerciseLibraryExercise;
  history?: MemberExerciseCompletion[];
  relatedExercises?: ExerciseLibraryExercise[];
  recentlyViewed?: MemberExerciseRecentView[];
}) {
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
        <div className="flex shrink-0 items-center gap-1">
          <ShareButton exerciseName={exercise.name} />
          <FavoriteButton
            externalId={exercise.externalId}
            initialIsFavorited={exercise.isFavorited}
            exerciseName={exercise.name}
          />
        </div>
      </div>

      <p className="text-xs text-[#6B7A72]">
        {[exercise.category, exercise.level, exercise.mechanic, exercise.force]
          .filter(Boolean)
          .join(' · ') || 'No category metadata returned'}
      </p>

      <div className="relative overflow-hidden rounded-2xl border border-[#1B3A2D]/10 bg-white shadow-sm">
        <div className="absolute left-3 top-3 z-10">
          <MediaBadge exercise={exercise} />
        </div>
        {exercise.videoUrl ? (
          <video
            key={exercise.videoUrl}
            src={exercise.videoUrl}
            controls
            playsInline
            preload="metadata"
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
          <div className="h-56">
            <MediaPlaceholder />
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
        {exercise.safetyInfo && (
          <DetailField label="Safety information" value={exercise.safetyInfo} />
        )}
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
                  className="mef-focus-ring rounded-full border border-[#1B3A2D]/15 px-3 py-1 text-xs font-medium text-[#1B3A2D] hover:border-[#1B3A2D]/40"
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
                  className="mef-focus-ring rounded-full border border-[#1B3A2D]/15 px-3 py-1 text-xs font-medium text-[#1B3A2D] hover:border-[#1B3A2D]/40"
                >
                  {name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {relatedExercises.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Related exercises
          </p>
          <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1">
            {relatedExercises.map((related) => (
              <RelatedChip key={related.externalId} exercise={related} />
            ))}
          </div>
        </div>
      )}

      <ExerciseCompletionControls externalId={exercise.externalId} exerciseName={exercise.name} />

      <ExerciseHistoryList history={history} />

      {recentlyViewed.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Recently viewed
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {recentlyViewed.map((view) => (
              <Link
                key={view.id}
                href={`/exercises/${encodeURIComponent(view.external_id)}` as Route}
                className="mef-focus-ring shrink-0 rounded-full border border-[#1B3A2D]/15 bg-white px-3.5 py-2 text-xs font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/40"
              >
                {view.exercise_name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
