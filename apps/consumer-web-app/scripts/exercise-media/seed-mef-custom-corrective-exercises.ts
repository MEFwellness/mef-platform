#!/usr/bin/env npx tsx
/**
 * Reads docs/exercise-media/mef-custom-corrective-exercises.json (the
 * reviewable source — coach-quality cues, corrective metadata, all
 * hand-authored, no Your Move data or AI call involved) and generates
 * supabase/migrations/00000000000130_mef_custom_corrective_exercises_data.sql
 * — a pure-SQL data migration inserting one exercise_catalog row +
 * one mef_exercise_metadata row per exercise, both provider = 'mef_custom'
 * (migration 129). Same generated-migration convention as migration
 * 120/128 — no live script connection to production, ever.
 *
 * Every row is cue-only: has_video/has_video_white/has_video_gym all
 * false, no poster, no video_url — these display via the existing
 * no-video fallback (CuesPlaceholder, see lib/exercise-library/normalize.ts)
 * exactly like any other cue-only catalog exercise.
 *
 * Usage: npx tsx scripts/exercise-media/seed-mef-custom-corrective-exercises.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DATA_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/mef-custom-corrective-exercises.json');
const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../supabase/migrations/00000000000130_mef_custom_corrective_exercises_data.sql'
);

interface CustomExercise {
  externalId: string;
  name: string;
  category: string;
  exerciseType: string[];
  equipment: string;
  difficulty: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  description: string;
  instructions: string[];
  exerciseTips: string[];
  correctiveRoles: string[];
  musclesStretched: string[];
  musclesStrengthened: string[];
  strainLevel: string;
  spinalFlexionCore: boolean;
  coachingCues: string[];
}

function sqlStringArray(values: string[]): string {
  if (values.length === 0) return "'{}'::text[]";
  return `ARRAY[${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')}]::text[]`;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildCatalogInsert(e: CustomExercise): string {
  return (
    `insert into exercise_catalog ` +
    `("provider","external_id","name","slug","description","instructions","exercise_tips",` +
    `"primary_muscle","secondary_muscles","equipment","category","difficulty","exercise_type",` +
    `"has_video","has_video_white","has_video_gym") values (` +
    `'mef_custom', ${sqlString(e.externalId)}, ${sqlString(e.name)}, ${sqlString(e.externalId)}, ` +
    `${sqlString(e.description)}, ${sqlStringArray(e.instructions)}, ${sqlStringArray(e.exerciseTips)}, ` +
    `${sqlString(e.primaryMuscle)}, ${sqlStringArray(e.secondaryMuscles)}, ${sqlString(e.equipment)}, ` +
    `${sqlString(e.category)}, ${sqlString(e.difficulty)}, ${sqlStringArray(e.exerciseType)}, ` +
    `false, false, false` +
    `) on conflict (provider, external_id) do update set ` +
    `"name" = excluded."name", "description" = excluded."description", "instructions" = excluded."instructions", ` +
    `"exercise_tips" = excluded."exercise_tips", "primary_muscle" = excluded."primary_muscle", ` +
    `"secondary_muscles" = excluded."secondary_muscles", "equipment" = excluded."equipment", ` +
    `"category" = excluded."category", "difficulty" = excluded."difficulty", ` +
    `"exercise_type" = excluded."exercise_type", "updated_at" = now();`
  );
}

function buildMetadataInsert(e: CustomExercise): string {
  return (
    `insert into mef_exercise_metadata ` +
    `("provider","external_id","equipment","difficulty","coaching_cues",` +
    `"corrective_roles","muscles_stretched","muscles_strengthened","strain_level","spinal_flexion_core") values (` +
    `'mef_custom', ${sqlString(e.externalId)}, ${sqlStringArray([e.equipment])}, ${sqlString(e.difficulty)}, ` +
    `${sqlStringArray(e.coachingCues)}, ${sqlStringArray(e.correctiveRoles)}, ${sqlStringArray(e.musclesStretched)}, ` +
    `${sqlStringArray(e.musclesStrengthened)}, ${sqlString(e.strainLevel)}, ${e.spinalFlexionCore}` +
    `) on conflict (provider, external_id) do update set ` +
    `"equipment" = excluded."equipment", "difficulty" = excluded."difficulty", ` +
    `"coaching_cues" = excluded."coaching_cues", "corrective_roles" = excluded."corrective_roles", ` +
    `"muscles_stretched" = excluded."muscles_stretched", "muscles_strengthened" = excluded."muscles_strengthened", ` +
    `"strain_level" = excluded."strain_level", "spinal_flexion_core" = excluded."spinal_flexion_core", ` +
    `"updated_at" = now();`
  );
}

function main() {
  const parsed = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as { exercises: CustomExercise[] };
  const exercises = parsed.exercises;

  const statements: string[] = [];
  for (const e of exercises) {
    statements.push(buildCatalogInsert(e));
    statements.push(buildMetadataInsert(e));
  }

  const sql =
    `-- Generated data migration: MEF-authored custom corrective exercises.\n` +
    `-- Produced by scripts/exercise-media/seed-mef-custom-corrective-exercises.ts from\n` +
    `-- docs/exercise-media/mef-custom-corrective-exercises.json (the reviewable source —\n` +
    `-- full coach-quality cues for every exercise). Cue-only: no video, no poster, no\n` +
    `-- Your Move data or API call involved. provider = 'mef_custom' throughout (migration\n` +
    `-- 129) — permanently excluded from the Your Move purge script by provider, not by\n` +
    `-- accident (see tests/mef-custom-exercise-purge-exclusion.test.ts).\n\n` +
    `begin;\n\n` +
    statements.join('\n') +
    `\n\ncommit;\n`;

  writeFileSync(MIGRATION_PATH, sql);
  console.log(`Wrote ${exercises.length} exercises (${statements.length} statements) to ${MIGRATION_PATH}`);
}

main();
