/**
 * Exercise detail — read entirely from our own database (exercise_catalog
 * + mef_exercise_metadata), never a live vendor call, merged with the
 * viewer's favorite state before render. A missing exercise id renders an
 * inline "not found" state instead of throwing.
 *
 * Coach and administrator only, exactly like the library index it is
 * reached from — see app/exercises/page.tsx's own header.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StaffNav } from '@/components/StaffNav';
import { requireStaffForInternalTool } from '@/lib/auth/staffOnlyPage';
import { BackButton } from '@/components/BackButton';
import { ExerciseDetailView } from '@/components/exercise-library/ExerciseDetailView';
import { ErrorBanner, type ExerciseApiErrorShape } from '@/components/exercise-library/StateBanners';
import { getExerciseByExternalId } from '@/lib/your-move/catalog';
import { getExerciseMetadata } from '@/lib/exercise-library/metadata';
import { isExerciseFavorited } from '@/lib/exercise-library/favorites';
import { normalizeExerciseCatalogRow } from '@/lib/exercise-library/normalize';
import { listMyRecentlyViewedExercises } from '@/lib/exercise-library/recentViews';
import { TrackExerciseView } from '@/components/exercise-library/TrackExerciseView';
import { listExerciseCompletionHistory } from '@/lib/exercise-library/completions';
import { getRelatedExercises } from '@/lib/exercise-library/related';
import { getExtractedPoster } from '@/lib/your-move/posters';

export default async function ExerciseDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { isCoach, isAdmin } = await requireStaffForInternalTool();

  let error: ExerciseApiErrorShape | null = null;
  let content: React.ReactNode = null;

  try {
    // listMyRecentlyViewedExercises has no dependency on the exercise
    // being fetched, so it runs in the same round as the catalog lookup
    // instead of waiting behind it — only getRelatedExercises has a real
    // dependency (this exercise's own muscle/category) and stays
    // sequenced after.
    const [rawExercise, metadata, isFavorited, history, recentlyViewedRaw, extractedPoster] = await Promise.all([
      getExerciseByExternalId(supabase, params.id),
      getExerciseMetadata(supabase, params.id),
      isExerciseFavorited(supabase, user.id, 'your_move', params.id),
      listExerciseCompletionHistory(supabase, user.id, 'your_move', params.id),
      listMyRecentlyViewedExercises(supabase, user.id, 6),
      getExtractedPoster(supabase, params.id),
    ]);

    if (!rawExercise) {
      error = { code: 'NOT_FOUND', message: 'Exercise not found', retryAfterSeconds: null };
    } else {
      const exercise = normalizeExerciseCatalogRow(rawExercise, metadata, isFavorited, extractedPoster);

      const relatedExercises = await getRelatedExercises(supabase, user.id, {
        externalId: exercise.externalId,
        primaryMuscle: exercise.primaryMuscle,
        category: exercise.category,
      });
      const recentlyViewed = recentlyViewedRaw.filter((view) => view.external_id !== exercise.externalId);

      content = (
        <>
          {/* L3: recorded from a mounted effect, not from this render. A
              prefetch runs the render, and a prefetch is not somebody
              opening the exercise. See the component's own header. */}
          <TrackExerciseView externalId={params.id} exerciseName={exercise.name} />
          <ExerciseDetailView
            exercise={exercise}
            history={history}
            relatedExercises={relatedExercises}
            recentlyViewed={recentlyViewed}
          />
        </>
      );
    }
  } catch (err) {
    console.error('[exercise-library] detail page failed', err);
    error = { code: 'INTERNAL_ERROR', message: 'Something went wrong loading this exercise.', retryAfterSeconds: null };
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/exercises" label="Exercise Library" />

        <div className="mt-6">{error ? <ErrorBanner error={error} /> : content}</div>
      </main>

      <StaffNav isCoach={isCoach} isAdmin={isAdmin} />
    </div>
  );
}
