/**
 * Resolves a playable Your Move video URL for one exercise, at the moment
 * a member actually taps play — never before. This is the one path in the
 * app allowed to call YourMoveApiClient.getExercise (the metered,
 * video-including endpoint); everything else (browse, search, filters)
 * reads exercise_catalog directly instead.
 *
 * Checks the ~10min DB cache (exercise_catalog.video_url) first — a cache
 * hit costs zero Your Move requests and never re-spends quota for a
 * member replaying the same clip. A miss/expiry means exactly one fresh
 * GET /exercises/{id} call, whose result is cached again before returning.
 *
 * The trial API key only serves a subset of Your Move's catalog — any
 * failure here (not just a network/5xx error, but also a paid-tier-only
 * exercise) resolves to {status:'error'}, and the caller (TapToPlayVideo)
 * falls back to rendering this exercise's generated cues instead of a
 * broken player. Once a full-access key replaces the trial key, the exact
 * same code path simply starts succeeding for those exercises — no code
 * change required.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getExerciseByExternalId, cacheVideoUrl, isVideoUrlCacheValid } from './catalog';
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
  externalId: string
): Promise<PlaybackResult> {
  const row = await getExerciseByExternalId(supabase, externalId);
  if (!row || !row.has_video) return { status: 'not_mapped' };

  if (isVideoUrlCacheValid(row)) {
    return { status: 'ok', videoUrl: row.video_url as string };
  }

  const client = buildYourMoveApiClientFromEnv();
  if (!client) return { status: 'not_configured' };

  try {
    const exercise = await client.getExercise(row.external_id);
    const videoUrl = pickVideoUrl(exercise);
    if (!videoUrl) {
      return { status: 'error', message: 'Your Move returned no playable video for this exercise' };
    }
    await cacheVideoUrl(supabase, row.id, videoUrl);
    return { status: 'ok', videoUrl };
  } catch (err) {
    if (err instanceof YourMoveApiError) {
      return { status: 'error', message: err.message };
    }
    console.error('resolveYourMoveVideoUrl unexpected error', err);
    return { status: 'error', message: 'Unexpected error fetching video' };
  }
}
