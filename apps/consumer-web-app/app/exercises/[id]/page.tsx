/**
 * Exercise detail — fetched server-side directly through apiClient.ts
 * (no client-side round trip through app/api/exercises needed for a page
 * load), merged with MEF metadata and the member's favorite state before
 * render. Every failure mode (API unavailable, not found, rate limited,
 * network error) renders an inline state instead of throwing — a bad
 * exercise id or a momentary vendor outage should never crash this page.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { BackButton } from '@/components/BackButton';
import { ExerciseDetailView } from '@/components/exercise-library/ExerciseDetailView';
import { ErrorBanner, type ExerciseApiErrorShape } from '@/components/exercise-library/StateBanners';
import { buildExerciseApiClientFromEnv, ExerciseApiError } from '@/lib/exercise-library/apiClient';
import { getExerciseMetadata } from '@/lib/exercise-library/metadata';
import { isExerciseFavorited } from '@/lib/exercise-library/favorites';
import { normalizeExerciseApiExercise } from '@/lib/exercise-library/normalize';

export default async function ExerciseDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');

  let error: ExerciseApiErrorShape | null = null;
  let content: React.ReactNode = null;

  const client = buildExerciseApiClientFromEnv();
  if (!client) {
    error = {
      code: 'NOT_CONFIGURED',
      message: 'The Exercise Library is temporarily unavailable.',
      retryAfterSeconds: null,
    };
  } else {
    try {
      const [rawExercise, metadata, isFavorited] = await Promise.all([
        client.getExercise(params.id),
        getExerciseMetadata(supabase, 'exercise_api_dev', params.id),
        isExerciseFavorited(supabase, user.id, 'exercise_api_dev', params.id),
      ]);
      const exercise = normalizeExerciseApiExercise(rawExercise, metadata, isFavorited);
      content = <ExerciseDetailView exercise={exercise} />;
    } catch (err) {
      if (err instanceof ExerciseApiError) {
        error = { code: err.code, message: err.message, retryAfterSeconds: err.retryAfterSeconds ?? null };
      } else {
        console.error('[exercise-library] detail page failed', err);
        error = {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong loading this exercise.',
          retryAfterSeconds: null,
        };
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/exercises" label="Exercise Library" />

        <div className="mt-6">{error ? <ErrorBanner error={error} /> : content}</div>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
