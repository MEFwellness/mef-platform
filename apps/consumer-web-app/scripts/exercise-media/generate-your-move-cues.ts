#!/usr/bin/env npx tsx
/**
 * Generates 2-3 short coaching cues (lib/exercise-library/cueGeneration.ts
 * — reuses Your Move's own instructions/importantPoints when present,
 * template fallback otherwise) for EVERY exercise in exercise_catalog and
 * writes them to mef_exercise_metadata.coaching_cues.
 *
 * Repointed at Your Move as the source (previously ExerciseAPI.dev) —
 * cueGeneration.ts itself is unchanged, only what feeds it. Cues are now
 * generated for the whole catalog, not just the handful of exercises with
 * no video: 856/857 Your Move exercises have video, but the trial API key
 * only serves a subset of them, so every exercise needs a cues fallback
 * for the rare exercise with no video AND for a tap-to-play failure on
 * any video exercise (see TapToPlayVideo, ExerciseDetailView.tsx).
 *
 * Your Move has no force/mechanic field (ExerciseAPI.dev did) — passed as
 * null; cueGeneration.ts's template fallback already handles a null force/
 * mechanic gracefully (its own generic case).
 *
 * Safe to re-run: skips any exercise that already has cues, unless
 * --force is passed.
 *
 * Usage: SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/generate-your-move-cues.ts [--force]
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateCues } from '../../lib/exercise-library/cueGeneration';
import { upsertExerciseMetadataCues, getExerciseMetadataMap } from '../../lib/exercise-library/metadata';
import type { ExerciseCatalogRow, MefExerciseMetadata } from '@mef/shared-types-contracts';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const CUE_REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/cue-report.json');
const FORCE = process.argv.includes('--force');

async function fetchAllCatalogRows(supabase: SupabaseClient): Promise<ExerciseCatalogRow[]> {
  const all: ExerciseCatalogRow[] = [];
  const PAGE_SIZE = 500;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('exercise_catalog')
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read exercise_catalog: ${error.message}`);
    const rows = (data as ExerciseCatalogRow[]) ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

async function main() {
  const supabase: SupabaseClient = createClient(
    requiredEnv('SEED_SUPABASE_URL'),
    requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY')
  );

  const catalog = await fetchAllCatalogRows(supabase);
  console.log(`Generating cues for ${catalog.length} exercises (force=${FORCE})...`);

  // getExerciseMetadataMap builds an `.in(...)` query string — batched here
  // since the full catalog's external_ids in one request blows past
  // Postgres/PostgREST's URI length limit (a real bug found running this
  // against the full 857-exercise catalog; the browse route's own callers
  // never hit this, they only ever pass one page — ~30 ids — at a time).
  const METADATA_BATCH_SIZE = 200;
  const existingMetadata = new Map<string, MefExerciseMetadata>();
  for (let i = 0; i < catalog.length; i += METADATA_BATCH_SIZE) {
    const batchIds = catalog.slice(i, i + METADATA_BATCH_SIZE).map((c) => c.external_id);
    const batchMap = await getExerciseMetadataMap(supabase, batchIds);
    for (const [key, value] of batchMap) existingMetadata.set(key, value);
  }

  const written: { externalId: string; name: string; cues: string[]; source: string }[] = [];
  let skipped = 0;

  for (const exercise of catalog) {
    const existing = existingMetadata.get(exercise.external_id);
    if (!FORCE && existing && existing.coaching_cues.length > 0) {
      skipped += 1;
      continue;
    }

    const result = generateCues({
      name: exercise.name,
      instructions: exercise.instructions,
      exerciseTips: exercise.exercise_tips,
      primaryMuscles: exercise.primary_muscle ? [exercise.primary_muscle] : [],
      equipment: exercise.equipment,
      force: null,
      mechanic: null,
    });

    const ok = await upsertExerciseMetadataCues(supabase, 'your_move', exercise.external_id, result.cues);
    if (ok) {
      written.push({ externalId: exercise.external_id, name: exercise.name, cues: result.cues, source: result.source });
    }
  }

  writeFileSync(
    CUE_REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        counts: {
          total: written.length,
          fromVendorInstructions: written.filter((w) => w.source === 'vendor_instructions').length,
          fromTemplate: written.filter((w) => w.source === 'template').length,
          skippedAlreadyDone: skipped,
        },
        written,
      },
      null,
      2
    )
  );
  console.log(`Wrote cues for ${written.length} exercises (${skipped} already done). Full list: ${CUE_REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
