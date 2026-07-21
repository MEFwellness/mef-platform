'use client';

/**
 * The Exercise Library's pre-search "welcome back" state — same "here's
 * where you left off" framing as MEF's other resume-friendly surfaces,
 * expanded from the original two-rail RecentExerciseRails into five
 * distinct sections: a prominent Continue card, Favorites, Recently
 * Viewed, Recently Completed, and one Suggested Next Exercise pick.
 * Fetched client-side (this whole browse experience is already a client
 * component, see ExerciseLibraryBrowser.tsx) via the same server actions
 * FavoriteButton already calls into, plus the two new ones added for this
 * milestone (getMyFavoriteExercises, getSuggestedNextExercise).
 */

import { useEffect, useState } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Heart, History, Sparkles } from 'lucide-react';
import type {
  ExerciseLibraryExercise,
  MemberExerciseCompletion,
  MemberExerciseRecentView,
} from '@mef/shared-types-contracts';
import {
  getMyRecentlyCompletedExercises,
  getMyRecentlyViewedExercises,
  getMyResumeExercise,
  getMyFavoriteExercises,
  getSuggestedNextExercise,
} from '@/app/actions/exercise-library';
import { MediaBadge } from './MediaBadge';

function Rail({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: typeof History;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wider">{title}</p>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{children}</div>
    </div>
  );
}

function Chip({ externalId, name }: { externalId: string; name: string }) {
  return (
    <Link
      href={`/exercises/${encodeURIComponent(externalId)}` as Route}
      className="mef-focus-ring shrink-0 rounded-full border border-[#1B3A2D]/15 bg-white px-3.5 py-2 text-xs font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/40"
    >
      {name}
    </Link>
  );
}

export function ResumeExperience() {
  const [resume, setResume] = useState<MemberExerciseRecentView | null>(null);
  const [recentlyViewed, setRecentlyViewed] = useState<MemberExerciseRecentView[]>([]);
  const [recentlyCompleted, setRecentlyCompleted] = useState<MemberExerciseCompletion[]>([]);
  const [favorites, setFavorites] = useState<ExerciseLibraryExercise[]>([]);
  const [suggested, setSuggested] = useState<ExerciseLibraryExercise | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getMyResumeExercise(),
      getMyRecentlyViewedExercises(10),
      getMyRecentlyCompletedExercises(10),
      getMyFavoriteExercises(10),
      getSuggestedNextExercise(),
    ])
      .then(([resumeExercise, viewed, completed, favoriteExercises, suggestion]) => {
        if (cancelled) return;
        setResume(resumeExercise);
        setRecentlyViewed(viewed);
        setRecentlyCompleted(completed);
        setFavorites(favoriteExercises);
        setSuggested(suggestion);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;

  const hasNothing =
    !resume &&
    recentlyViewed.length === 0 &&
    recentlyCompleted.length === 0 &&
    favorites.length === 0 &&
    !suggested;

  if (hasNothing) return null;

  return (
    <div className="mef-animate-in">
      {resume && (
        <Link
          href={`/exercises/${encodeURIComponent(resume.external_id)}` as Route}
          className="mef-focus-ring group flex items-center justify-between gap-4 rounded-2xl border border-[#1B3A2D]/10 bg-white p-5 shadow-sm transition hover:border-[#1B3A2D]/30 hover:shadow-[0_10px_28px_-8px_rgba(27,58,45,0.18)]"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              Resume where you left off
            </p>
            <p className="mt-1 text-base font-semibold text-[#1B3A2D]">{resume.exercise_name}</p>
          </div>
          <span className="mef-focus-ring flex shrink-0 items-center gap-1.5 rounded-full bg-[#1B3A2D] px-4 py-2.5 text-sm font-semibold text-white transition group-hover:brightness-110">
            Continue
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </span>
        </Link>
      )}

      {favorites.length > 0 && (
        <Rail title="Favorites" Icon={Heart}>
          {favorites.map((exercise) => (
            <Chip key={exercise.externalId} externalId={exercise.externalId} name={exercise.name} />
          ))}
        </Rail>
      )}

      {recentlyViewed.length > 0 && (
        <Rail title="Recently Viewed" Icon={History}>
          {recentlyViewed
            .filter((view) => view.external_id !== resume?.external_id)
            .map((view) => (
              <Chip key={view.id} externalId={view.external_id} name={view.exercise_name} />
            ))}
        </Rail>
      )}

      {recentlyCompleted.length > 0 && (
        <Rail title="Recently Completed" Icon={CheckCircle2}>
          {recentlyCompleted.map((completion) => (
            <Chip
              key={completion.id}
              externalId={completion.external_id}
              name={completion.exercise_name}
            />
          ))}
        </Rail>
      )}

      {suggested && (
        <div className="mt-5">
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wider">
              Suggested Next Exercise
            </p>
          </div>
          <Link
            href={`/exercises/${encodeURIComponent(suggested.externalId)}` as Route}
            className="mef-focus-ring mt-2 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[#1B3A2D]/20 bg-[#EFF6F1]/60 p-4 transition hover:border-[#1B3A2D]/40"
          >
            <div>
              <p className="text-sm font-semibold text-[#1B3A2D]">{suggested.name}</p>
              <p className="mt-0.5 text-xs text-[#6B7A72]">
                {[suggested.category, suggested.level].filter(Boolean).join(' · ') ||
                  'Try something new'}
              </p>
            </div>
            <MediaBadge exercise={suggested} />
          </Link>
        </div>
      )}
    </div>
  );
}
