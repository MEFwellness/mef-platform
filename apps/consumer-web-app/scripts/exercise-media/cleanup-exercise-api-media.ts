#!/usr/bin/env npx tsx
/**
 * Deletes every ExerciseAPI.dev-era media asset before migration 119 drops
 * exercise_open_license_images and your_move_exercise_links:
 *
 *   - The 3 Wikimedia-sourced open-license images (exercise_open_license_images)
 *     — both their storage objects and their DB rows.
 *   - Any exercise_extracted_posters row with source='exercise_api_dev' —
 *     dead reference now that ExerciseAPI.dev is gone entirely (its
 *     storage object too).
 *
 * MUST run before migration 00000000000119_your_move_sole_catalog.sql is
 * applied (it drops exercise_open_license_images outright) — run this
 * first against whichever database migration 119 is about to be applied
 * to, local or production.
 *
 * Usage: SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/cleanup-exercise-api-media.ts
 */
import { createClient } from '@supabase/supabase-js';
import { EXERCISE_MEDIA_BUCKET } from '../../lib/your-move/posters';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

async function main() {
  const supabase = createClient(requiredEnv('SEED_SUPABASE_URL'), requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY'));

  const { data: images, error: imagesError } = await supabase.from('exercise_open_license_images').select('*');
  if (imagesError) throw new Error(`exercise_open_license_images read failed: ${imagesError.message}`);
  const imageRows = images ?? [];

  if (imageRows.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(EXERCISE_MEDIA_BUCKET)
      .remove(imageRows.map((r) => r.storage_path));
    if (storageError) console.error('exercise_open_license_images storage removal failed', storageError);

    const { error: deleteError } = await supabase
      .from('exercise_open_license_images')
      .delete()
      .in(
        'id',
        imageRows.map((r) => r.id)
      );
    if (deleteError) throw new Error(`exercise_open_license_images row delete failed: ${deleteError.message}`);
  }
  console.log(`Removed ${imageRows.length} open-license image(s):`, imageRows.map((r) => r.external_id));

  const { data: posters, error: postersError } = await supabase
    .from('exercise_extracted_posters')
    .select('*')
    .eq('source', 'exercise_api_dev');
  if (postersError) throw new Error(`exercise_extracted_posters read failed: ${postersError.message}`);
  const posterRows = posters ?? [];

  if (posterRows.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(EXERCISE_MEDIA_BUCKET)
      .remove(posterRows.map((r) => r.storage_path));
    if (storageError) console.error('exercise_api_dev-sourced poster storage removal failed', storageError);

    const { error: deleteError } = await supabase
      .from('exercise_extracted_posters')
      .delete()
      .in(
        'id',
        posterRows.map((r) => r.id)
      );
    if (deleteError) throw new Error(`exercise_extracted_posters row delete failed: ${deleteError.message}`);
  }
  console.log(`Removed ${posterRows.length} exercise_api_dev-sourced extracted poster(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
