#!/usr/bin/env npx tsx
/**
 * Phase 4: for every exercise still uncovered after Phase 2 (video) and
 * Phase 3 (docs/exercise-media/license-sourcing-report.json's
 * noQualifyingImage list), generates 2-3 short coaching cues
 * (lib/exercise-library/cueGeneration.ts — reuses the vendor's own
 * instructions/tips when present, template fallback otherwise) and writes
 * them to mef_exercise_metadata.coaching_cues, the exact column
 * ExerciseDetailView already reads and the one normalize.ts now falls
 * back to for the card/detail media-substitute.
 *
 * Usage: EXERCISE_API_KEY=... SEED_SUPABASE_URL=... \
 *   SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/write-cues.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ExerciseApiClient } from '../../lib/exercise-library/apiClient';
import { generateCues } from '../../lib/exercise-library/cueGeneration';
import { upsertExerciseMetadataCues, getExerciseMetadata } from '../../lib/exercise-library/metadata';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const LICENSE_REPORT_PATH = path.resolve(
  __dirname,
  '../../../../docs/exercise-media/license-sourcing-report.json'
);
const CUE_REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/cue-report.json');

type NoQualifyingImage = { externalId: string; name: string };

async function main() {
  if (!existsSync(LICENSE_REPORT_PATH)) {
    throw new Error('Run source-open-license-images.ts first.');
  }
  const { noQualifyingImage } = JSON.parse(readFileSync(LICENSE_REPORT_PATH, 'utf-8')) as {
    noQualifyingImage: NoQualifyingImage[];
  };

  const apiClient = new ExerciseApiClient(requiredEnv('EXERCISE_API_KEY'));
  const supabase: SupabaseClient = createClient(
    requiredEnv('SEED_SUPABASE_URL'),
    requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY')
  );

  console.log(`Generating cues for ${noQualifyingImage.length} still-uncovered exercises...`);

  const written: { externalId: string; name: string; cues: string[]; source: string }[] = [];
  let skipped = 0;

  for (const target of noQualifyingImage) {
    try {
      const existing = await getExerciseMetadata(supabase, 'exercise_api_dev', target.externalId);
      if (existing && existing.coaching_cues.length > 0) {
        skipped += 1;
        continue;
      }

      const exercise = await apiClient.getExercise(target.externalId);
      const result = generateCues({
        name: exercise.name,
        instructions: exercise.instructions ?? [],
        exerciseTips: exercise.exerciseTips ?? [],
        primaryMuscles: exercise.primaryMuscles ?? [],
        equipment: exercise.equipment ?? null,
        force: exercise.force ?? null,
        mechanic: exercise.mechanic ?? null,
      });

      const ok = await upsertExerciseMetadataCues(supabase, 'exercise_api_dev', target.externalId, result.cues);
      if (ok) {
        written.push({ externalId: target.externalId, name: exercise.name, cues: result.cues, source: result.source });
        console.log(`  [${result.source}] ${exercise.name}: ${result.cues.join(' / ')}`);
      }
    } catch (err) {
      console.error(`Failed to generate/write cues for ${target.name} (${target.externalId})`, err);
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
        },
        written,
      },
      null,
      2
    )
  );
  console.log(
    `\nWrote cues for ${written.length} exercises (${skipped} already done in a prior run). Full list: ${CUE_REPORT_PATH}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
