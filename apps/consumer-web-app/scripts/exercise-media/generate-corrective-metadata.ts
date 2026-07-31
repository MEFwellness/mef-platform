#!/usr/bin/env npx tsx
/**
 * Runs correctiveClassification.ts's rules over every exercise_catalog row
 * and produces two artifacts:
 *
 *   1. docs/exercise-media/corrective-metadata-report.json — the
 *      reviewable data file: one entry per exercise with its assigned
 *      corrective_roles/muscles_stretched/muscles_strengthened/
 *      strain_level/spinal_flexion_core, plus a flag+note for any exercise
 *      classified from thin data (see the report's `lowConfidence` list).
 *
 *   2. supabase/migrations/00000000000128_corrective_exercise_metadata_data.sql
 *      — a pure-SQL data migration (UPDATE per row, keyed by
 *      provider+external_id), same convention as migration 120's
 *      "generated data migration" so this can be applied via the same
 *      `supabase db push` path already used for every other catalog
 *      change — no live script connection to production, ever.
 *
 * Read-only against exercise_catalog (browse-mode columns already in the
 * local DB) — zero Your Move API calls, zero video quota used.
 *
 * Usage: SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/generate-corrective-metadata.ts
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { classifyExercise, type CorrectiveClassification } from '../../lib/exercise-library/correctiveClassification';
import type { ExerciseCatalogRow } from '@mef/shared-types-contracts';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/corrective-metadata-report.json');
const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../supabase/migrations/00000000000128_corrective_exercise_metadata_data.sql'
);

async function fetchAllCatalogRows(supabase: SupabaseClient): Promise<ExerciseCatalogRow[]> {
  const all: ExerciseCatalogRow[] = [];
  const PAGE_SIZE = 500;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('exercise_catalog')
      .select('*')
      .order('external_id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read exercise_catalog: ${error.message}`);
    const rows = (data as ExerciseCatalogRow[]) ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

function sqlStringArray(values: string[]): string {
  if (values.length === 0) return "'{}'::text[]";
  return `ARRAY[${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')}]::text[]`;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildUpdateStatement(row: ExerciseCatalogRow, c: CorrectiveClassification): string {
  return (
    `update mef_exercise_metadata set ` +
    `corrective_roles = ${sqlStringArray(c.correctiveRoles)}, ` +
    `muscles_stretched = ${sqlStringArray(c.musclesStretched)}, ` +
    `muscles_strengthened = ${sqlStringArray(c.musclesStrengthened)}, ` +
    `strain_level = ${sqlString(c.strainLevel)}, ` +
    `spinal_flexion_core = ${c.spinalFlexionCore}, ` +
    `equipment = ${sqlStringArray(c.equipmentNeeded)}, ` +
    `updated_at = now() ` +
    `where provider = 'your_move' and external_id = ${sqlString(row.external_id)};`
  );
}

async function main() {
  const supabase: SupabaseClient = createClient(
    requiredEnv('SEED_SUPABASE_URL'),
    requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY')
  );

  const catalog = await fetchAllCatalogRows(supabase);
  console.log(`Classifying ${catalog.length} exercises...`);

  const entries: {
    externalId: string;
    name: string;
    category: string | null;
    exerciseType: string[];
    correctiveRoles: string[];
    musclesStretched: string[];
    musclesStrengthened: string[];
    strainLevel: string;
    spinalFlexionCore: boolean;
    equipmentNeeded: string[];
    lowConfidence: boolean;
    confidenceNote: string | null;
  }[] = [];

  const sqlStatements: string[] = [];

  for (const exercise of catalog) {
    const classification = classifyExercise({
      name: exercise.name,
      description: exercise.description,
      primaryMuscle: exercise.primary_muscle,
      secondaryMuscles: exercise.secondary_muscles,
      equipment: exercise.equipment,
      category: exercise.category,
      difficulty: exercise.difficulty,
      exerciseType: exercise.exercise_type,
    });

    entries.push({
      externalId: exercise.external_id,
      name: exercise.name,
      category: exercise.category,
      exerciseType: exercise.exercise_type,
      correctiveRoles: classification.correctiveRoles,
      musclesStretched: classification.musclesStretched,
      musclesStrengthened: classification.musclesStrengthened,
      strainLevel: classification.strainLevel,
      spinalFlexionCore: classification.spinalFlexionCore,
      equipmentNeeded: classification.equipmentNeeded,
      lowConfidence: classification.lowConfidence,
      confidenceNote: classification.confidenceNote,
    });

    sqlStatements.push(buildUpdateStatement(exercise, classification));
  }

  const roleCounts: Record<string, number> = {};
  for (const e of entries) {
    for (const role of e.correctiveRoles) {
      roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    }
  }

  const lowConfidence = entries.filter((e) => e.lowConfidence);
  const spinalFlexionCount = entries.filter((e) => e.spinalFlexionCore).length;

  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalExercises: entries.length,
        roleCounts,
        spinalFlexionCoreCount: spinalFlexionCount,
        lowConfidenceCount: lowConfidence.length,
        lowConfidence: lowConfidence.map((e) => ({
          externalId: e.externalId,
          name: e.name,
          note: e.confidenceNote,
        })),
        entries,
      },
      null,
      2
    )
  );

  const migrationSql =
    `-- Generated data migration: corrective-role classification for every exercise_catalog row.\n` +
    `-- Produced by scripts/exercise-media/generate-corrective-metadata.ts from\n` +
    `-- apps/consumer-web-app/lib/exercise-library/correctiveClassification.ts's rules —\n` +
    `-- see docs/exercise-media/corrective-metadata-report.json for the full reviewable\n` +
    `-- per-exercise breakdown this was generated from. A pure-SQL data migration (same\n` +
    `-- convention as migration 120) so this applies via the same \`supabase db push\`\n` +
    `-- path already used for every other catalog change.\n\n` +
    `begin;\n\n` +
    sqlStatements.join('\n') +
    `\n\ncommit;\n`;

  writeFileSync(MIGRATION_PATH, migrationSql);

  console.log(`Classified ${entries.length} exercises. Role counts:`, roleCounts);
  console.log(`spinal_flexion_core: ${spinalFlexionCount}, low confidence: ${lowConfidence.length}`);
  console.log(`Report: ${REPORT_PATH}`);
  console.log(`Migration: ${MIGRATION_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
