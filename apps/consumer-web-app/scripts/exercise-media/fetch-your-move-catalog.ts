#!/usr/bin/env npx tsx
/**
 * Fetches Your Move's ENTIRE exercise catalog in browse mode
 * (includeVideos=false, so this never spends quota — see
 * lib/your-move/apiClient.ts's listExercises) and stores it as
 * exercise_catalog (migration 119) — the sole Exercise Library catalog.
 * ExerciseAPI.dev is no longer read from at all.
 *
 * Category/difficulty are normalized (trimmed, lowercased, blank -> null)
 * since Your Move's own catalog has inconsistent casing on these fields
 * (e.g. "Legs" / "legs" / "LEGS" all appear) — normalizing once here keeps
 * every downstream filter/dropdown option honest.
 *
 * Safe to re-run at any time to refresh the catalog (e.g. Your Move adds
 * new exercises) — every row is upserted on (provider, external_id).
 *
 * Usage: YMOVE_API_KEY=... SEED_SUPABASE_URL=... \
 *   SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/fetch-your-move-catalog.ts
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { YourMoveApiClient, type YourMoveExercise } from '../../lib/your-move/apiClient';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/your-move-catalog-fetch-report.json');

function normalizeVocab(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

async function fetchAllYourMoveExercises(client: YourMoveApiClient): Promise<YourMoveExercise[]> {
  const all: YourMoveExercise[] = [];
  let page = 1;
  for (;;) {
    const result = await client.listExercises({ page, pageSize: 50 });
    all.push(...result.data);
    console.log(`Your Move browse: fetched ${all.length} (page ${page})`);
    if (result.data.length === 0) break;
    page += 1;
  }
  return all;
}

async function main() {
  const yourMoveClient = new YourMoveApiClient(requiredEnv('YMOVE_API_KEY'));
  const supabase = createClient(requiredEnv('SEED_SUPABASE_URL'), requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY'));

  const exercises = await fetchAllYourMoveExercises(yourMoveClient);

  const rows = exercises.map((exercise) => ({
    provider: 'your_move' as const,
    external_id: exercise.id,
    name: exercise.title,
    slug: exercise.slug ?? null,
    description: exercise.description ?? null,
    instructions: exercise.instructions ?? [],
    exercise_tips: exercise.importantPoints ?? [],
    primary_muscle: normalizeVocab(exercise.muscleGroup),
    secondary_muscles: (exercise.secondaryMuscles ?? []).map((m) => m.trim().toLowerCase()).filter(Boolean),
    equipment: normalizeVocab(exercise.equipment),
    category: normalizeVocab(exercise.category),
    difficulty: normalizeVocab(exercise.difficulty),
    exercise_type: (exercise.exerciseType ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    has_video: exercise.hasVideo,
    has_video_white: exercise.hasVideoWhite,
    has_video_gym: exercise.hasVideoGym,
    updated_at: new Date().toISOString(),
  }));

  const BATCH_SIZE = 200;
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('exercise_catalog').upsert(batch, { onConflict: 'provider,external_id' });
    if (error) {
      throw new Error(`Failed to upsert exercise_catalog batch starting at ${i}: ${error.message}`);
    }
    written += batch.length;
    console.log(`Upserted ${written}/${rows.length}`);
  }

  const report = {
    fetchedAt: new Date().toISOString(),
    yourMoveCatalogSize: exercises.length,
    withVideo: exercises.filter((e) => e.hasVideo).length,
    withoutVideo: exercises.filter((e) => !e.hasVideo).length,
    written,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log('Report written to', REPORT_PATH);
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
