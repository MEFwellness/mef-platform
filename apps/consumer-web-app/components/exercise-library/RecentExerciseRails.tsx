'use client';

/**
 * "Recently Viewed" and "Recently Completed" rails shown on the Exercise
 * Library browse page before a member searches — same "here's where you
 * left off" framing as MEF's other resume-friendly surfaces. Fetched
 * client-side (this whole browse experience is already a client
 * component, see ExerciseLibraryBrowser.tsx) via the same server actions
 * FavoriteButton already calls into.
 */

import { useEffect, useState } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import { History, CheckCircle2 } from 'lucide-react';
import type { MemberExerciseCompletion, MemberExerciseRecentView } from '@mef/shared-types-contracts';
import { getMyRecentlyCompletedExercises, getMyRecentlyViewedExercises } from '@/app/actions/exercise-library';

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
      className="shrink-0 rounded-full border border-[#1B3A2D]/15 bg-white px-3.5 py-2 text-xs font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/40"
    >
      {name}
    </Link>
  );
}

export function RecentExerciseRails() {
  const [recentlyViewed, setRecentlyViewed] = useState<MemberExerciseRecentView[]>([]);
  const [recentlyCompleted, setRecentlyCompleted] = useState<MemberExerciseCompletion[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyRecentlyViewedExercises(10), getMyRecentlyCompletedExercises(10)])
      .then(([viewed, completed]) => {
        if (cancelled) return;
        setRecentlyViewed(viewed);
        setRecentlyCompleted(completed);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || (recentlyViewed.length === 0 && recentlyCompleted.length === 0)) return null;

  return (
    <div>
      {recentlyViewed.length > 0 && (
        <Rail title="Resume where you left off" Icon={History}>
          {recentlyViewed.map((view) => (
            <Chip key={view.id} externalId={view.external_id} name={view.exercise_name} />
          ))}
        </Rail>
      )}
      {recentlyCompleted.length > 0 && (
        <Rail title="Recently completed" Icon={CheckCircle2}>
          {recentlyCompleted.map((completion) => (
            <Chip key={completion.id} externalId={completion.external_id} name={completion.exercise_name} />
          ))}
        </Rail>
      )}
    </div>
  );
}
