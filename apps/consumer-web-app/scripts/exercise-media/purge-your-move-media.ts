#!/usr/bin/env npx tsx
/**
 * The single documented command that removes every Your Move-derived
 * asset this app is only licensed to keep while the subscription is
 * active — run this if the Your Move subscription ever lapses.
 *
 * Removes, in order:
 *   1. Every exercise_extracted_posters row (all are source='your_move'
 *      now that Your Move is the sole catalog), and the actual storage
 *      object at each row's storage_path in the `exercise-media` bucket —
 *      these are frames extracted from Your Move's own video, the one
 *      asset type genuinely licensed only for the life of the
 *      subscription.
 *   2. Clears exercise_catalog's cached video_url/video_url_expires_at on
 *      every row — a ~10min fetch-at-play cache, not a real asset, but
 *      cleared anyway so no stale playable URL survives past
 *      cancellation.
 *
 * Deliberately does NOT delete exercise_catalog's own rows (name,
 * instructions, muscles, category, etc.) — that catalog metadata was
 * fetched via Your Move's quota-free browse endpoint and is this app's own
 * stored data, not vendor-proprietary media; only the video-derived assets
 * above are purge-eligible.
 *
 * The video_url cache clear is explicitly scoped to `provider = 'your_move'`
 * — exercise_catalog also holds MEF-authored custom exercises (migration
 * 129, provider = 'mef_custom'), which never have Your Move video and must
 * never be touched by this or any future vendor-cleanup step (see
 * tests/mef-custom-exercise-purge-exclusion.test.ts).
 *
 * Usage: SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/purge-your-move-media.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { removeYourMoveExtractedPosters, EXERCISE_MEDIA_BUCKET } from '../../lib/your-move/posters';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

export async function purgeYourMoveMedia(supabase: SupabaseClient) {
  const { removed: postersRemoved, storagePaths } = await removeYourMoveExtractedPosters(supabase);

  let storageObjectsRemoved = 0;
  if (storagePaths.length > 0) {
    const { data, error } = await supabase.storage.from(EXERCISE_MEDIA_BUCKET).remove(storagePaths);
    if (error) {
      console.error('Storage object removal failed', error);
    } else {
      storageObjectsRemoved = data?.length ?? 0;
    }
  }

  const { error: cacheClearError } = await supabase
    .from('exercise_catalog')
    .update({ video_url: null, video_url_expires_at: null })
    .eq('provider', 'your_move')
    .not('video_url', 'is', null);
  if (cacheClearError) console.error('Clearing cached video URLs failed', cacheClearError);

  return { postersRemoved, storageObjectsRemoved };
}

async function main() {
  const supabase: SupabaseClient = createClient(
    requiredEnv('SEED_SUPABASE_URL'),
    requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY')
  );
  const result = await purgeYourMoveMedia(supabase);
  console.log('Your Move media purge complete:', result);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
