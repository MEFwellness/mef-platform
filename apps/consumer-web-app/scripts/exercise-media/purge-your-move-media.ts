#!/usr/bin/env npx tsx
/**
 * The single documented command that removes every Your Move-derived
 * asset this app stores, per Your Move's cancellation-compliance
 * requirement — run this if the subscription ever lapses.
 *
 * Removes, in order:
 *   1. Every row in your_move_exercise_links (the our-id -> Your Move-id
 *      mapping, plus its short-lived cached video_url — see migration
 *      118). ExerciseAPI.dev-sourced video for the same exercises is
 *      completely unaffected (separate rows, separate source).
 *   2. Every exercise_extracted_posters row with source='your_move', and
 *      the actual storage object at each row's storage_path in the
 *      `exercise-media` bucket. source='exercise_api_dev' rows are left
 *      alone — those posters were extracted from a video this app has an
 *      independent, permanent right to use.
 *
 * Nothing else in this app reads or writes Your Move data — this is a
 * complete purge, not a best-effort one.
 *
 * Usage: SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/purge-your-move-media.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { removeAllYourMoveLinks } from '../../lib/your-move/links';
import { removeYourMoveExtractedPosters, EXERCISE_MEDIA_BUCKET } from '../../lib/your-move/posters';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

export async function purgeYourMoveMedia(supabase: SupabaseClient) {
  const { removed: linksRemoved } = await removeAllYourMoveLinks(supabase);
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

  return { linksRemoved, postersRemoved, storageObjectsRemoved };
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
