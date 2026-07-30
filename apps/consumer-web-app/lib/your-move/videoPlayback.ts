/**
 * Resolves a playable Your Move video URL for one MEF exercise, at the
 * moment a member actually taps play — never before. This is the one path
 * in the app allowed to call YourMoveApiClient.getExercise (the metered,
 * video-including endpoint); everything else (browse, matching, auditing)
 * must go through listExercises' browse mode instead.
 *
 * Checks the ~10min DB cache (your_move_exercise_links.video_url) first —
 * a cache hit costs zero Your Move requests and never re-spends quota for
 * a member replaying the same clip. A miss/expiry means exactly one fresh
 * GET /exercises/{id} call, whose result is cached again before returning.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExerciseLibraryProvider } from '@mef/shared-types-contracts';
import { getYourMoveLink, cacheVideoUrl, isVideoUrlCacheValid } from './links';
import { buildYourMoveApiClientFromEnv, YourMoveApiError } from './apiClient';

export type PlaybackResult =
  | { status: 'ok'; videoUrl: string }
  | { status: 'not_mapped' }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

function pickVideoUrl(exercise: { videoUrl?: string | null; videos?: { url: string }[] }): string | null {
  return exercise.videoUrl ?? exercise.videos?.[0]?.url ?? null;
}

export async function resolveYourMoveVideoUrl(
  supabase: SupabaseClient,
  provider: ExerciseLibraryProvider,
  externalId: string
): Promise<PlaybackResult> {
  const link = await getYourMoveLink(supabase, provider, externalId);
  if (!link) return { status: 'not_mapped' };

  if (isVideoUrlCacheValid(link)) {
    return { status: 'ok', videoUrl: link.video_url as string };
  }

  const client = buildYourMoveApiClientFromEnv();
  if (!client) return { status: 'not_configured' };

  try {
    const exercise = await client.getExercise(link.your_move_exercise_id);
    const videoUrl = pickVideoUrl(exercise);
    if (!videoUrl) {
      return { status: 'error', message: 'Your Move returned no playable video for this exercise' };
    }
    await cacheVideoUrl(supabase, link.id, videoUrl);
    return { status: 'ok', videoUrl };
  } catch (err) {
    if (err instanceof YourMoveApiError) {
      return { status: 'error', message: err.message };
    }
    console.error('resolveYourMoveVideoUrl unexpected error', err);
    return { status: 'error', message: 'Unexpected error fetching video' };
  }
}
