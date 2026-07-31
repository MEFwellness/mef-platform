#!/usr/bin/env npx tsx
/**
 * Runs the Corrective Program Generator Engine end-to-end: reads a
 * member's latest completed posture assessment findings (or accepts an
 * explicit --patterns override for demonstration/testing), detects which
 * of the 4 corrective blueprints apply, builds a 4-week program draft, and
 * saves it into the existing Coach Program Builder tables in status
 * 'pending_coach_review'. No coach UI exists yet to trigger this (that's
 * the next task) — this script is the only way to run the engine today.
 *
 * Usage (real member, reads their actual posture assessment findings):
 *   SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... npx tsx \
 *     scripts/corrective-program/generate-corrective-program.ts \
 *     --coach <coachId> --member <memberId> --member-label "Jane Doe" \
 *     --days 3 --seed jane-2026-07-30
 *
 * Usage (synthetic patterns, for demos/testing without seeding a real
 * assessment — skips the findings lookup entirely):
 *   ...same env vars... npx tsx scripts/corrective-program/generate-corrective-program.ts \
 *     --coach <coachId> --member-label "Sample Member" --days 3 \
 *     --seed demo-1 --patterns lower_cross:moderate
 *
 * Add --dry-run to print the generated program without writing anything.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BLUEPRINT_KEYS } from '../../lib/corrective-engine/types';
import type { BlueprintKey, CorrectiveSeverity, DetectedPattern } from '../../lib/corrective-engine/types';
import { CORRECTIVE_BLUEPRINTS } from '../../lib/corrective-engine/blueprints';
import { getLatestCompletedPostureAssessment } from '../../lib/corrective-engine/findings';
import { detectCorrectivePatterns } from '../../lib/corrective-engine/patternMapping';
import { loadCorrectiveExercisePool, DEFAULT_EQUIPMENT } from '../../lib/corrective-engine/exercisePool';
import { generateCorrectiveProgramDraft } from '../../lib/corrective-engine/programGenerator';
import { saveCorrectiveProgramDraft } from '../../lib/corrective-engine/save';
import type { CorrectiveProgramDraft } from '../../lib/corrective-engine/types';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function parsePatternsOverride(raw: string): DetectedPattern[] {
  return raw.split(',').map((entry) => {
    const [key, severity] = entry.split(':') as [string, string];
    if (!BLUEPRINT_KEYS.includes(key as BlueprintKey)) {
      throw new Error(`Unknown blueprint key "${key}". Valid: ${BLUEPRINT_KEYS.join(', ')}`);
    }
    if (!['mild', 'moderate', 'severe'].includes(severity)) {
      throw new Error(`Unknown severity "${severity}". Valid: mild, moderate, severe`);
    }
    return {
      blueprint: key as BlueprintKey,
      severity: severity as CorrectiveSeverity,
      supportingFindingIds: [],
    };
  });
}

function printDraft(draft: CorrectiveProgramDraft) {
  const patternLabel = draft.patterns
    .map((p) => `${CORRECTIVE_BLUEPRINTS[p.blueprint].name} (${p.severity})`)
    .join(' + ');
  console.log(`\n=== Corrective program: ${patternLabel} — overall severity: ${draft.overallSeverity} ===`);
  console.log(`Days/week: ${draft.daysPerWeek} | Equipment: ${draft.equipment.join(', ')} | Seed: ${draft.seed}`);
  console.log('4-week phase — this weekly session set repeats identically across all 4 weeks.\n');

  for (let week = 1; week <= 4; week++) {
    console.log(`--- Week ${week} ---`);
    for (const session of draft.weeklySessions) {
      console.log(`  ${session.label}`);
      for (const block of session.blocks) {
        console.log(`    [${block.name}] — ${block.blockReasoning}`);
        for (const exercise of block.exercises) {
          console.log(`      - ${exercise.exerciseName}`);
        }
      }
    }
    console.log('');
  }
}

async function resolvePatterns(
  supabase: SupabaseClient,
  memberId: string | undefined,
  override: string | undefined
): Promise<DetectedPattern[]> {
  if (override) return parsePatternsOverride(override);
  if (!memberId) throw new Error('Provide --member <id> (to read real findings) or --patterns (for a synthetic demo).');

  const assessment = await getLatestCompletedPostureAssessment(supabase, memberId);
  if (!assessment) {
    throw new Error(`No completed posture assessment found for member ${memberId}.`);
  }
  const patterns = detectCorrectivePatterns(assessment.findings);
  if (patterns.length === 0) {
    throw new Error(`Member ${memberId}'s latest posture assessment has no corrective-pattern findings.`);
  }
  return patterns;
}

async function main() {
  const supabase = createClient(
    requiredEnv('SEED_SUPABASE_URL'),
    requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY')
  );

  const coachId = argValue('--coach');
  if (!coachId) throw new Error('Missing required --coach <coachId>.');
  const memberId = argValue('--member');
  const memberLabel = argValue('--member-label') ?? memberId ?? 'Unnamed member';
  const days = Number(argValue('--days') ?? '3');
  if (days !== 2 && days !== 3) throw new Error('--days must be 2 or 3.');
  const seed = argValue('--seed');
  if (!seed) throw new Error('Missing required --seed <string>.');
  const patternsOverride = argValue('--patterns');
  const equipmentArg = argValue('--equipment');
  const equipment = equipmentArg ? equipmentArg.split(',').map((e) => e.trim()) : DEFAULT_EQUIPMENT;
  const dryRun = process.argv.includes('--dry-run');

  const patterns = await resolvePatterns(supabase, memberId, patternsOverride);
  const pool = await loadCorrectiveExercisePool(supabase, equipment);
  console.log(`Loaded ${pool.length} equipment-eligible, non-spinal-flexion exercises.`);

  const draft = generateCorrectiveProgramDraft({
    patterns,
    daysPerWeek: days as 2 | 3,
    equipment,
    seed,
    pool,
  });

  printDraft(draft);

  if (dryRun) {
    console.log('--dry-run set — nothing saved.');
    return;
  }
  if (!memberId) {
    console.log('No --member id given (synthetic --patterns demo) — nothing saved. Pass --member to persist.');
    return;
  }

  const saved = await saveCorrectiveProgramDraft(supabase, {
    draft,
    coachId,
    memberLabel,
    memberId,
  });
  console.log(`Saved as pending_coach_review. Program group tag: ${saved.programGroupTag}`);
  console.log(`Template ids: ${saved.templateIds.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
