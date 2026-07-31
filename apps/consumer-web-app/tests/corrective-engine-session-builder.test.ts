/**
 * Guard tests for the corrective program generator's session builder
 * (lib/corrective-engine/sessionBuilder.ts, programGenerator.ts) — real
 * local Supabase exercise pool, no mocks, same philosophy as every other
 * integration test in this suite (see tests/setup/test-clients.ts).
 *
 * Proves every hard rule from the task:
 *   1. No spinal_flexion_core exercise ever appears.
 *   2. No stretch/mobility pick ever targets a blueprint's LONG muscle.
 *   3. Core is always the last block.
 *   4. Session exercise counts stay within 8-12.
 *   5. Severe sessions have no strength block at all.
 *   6. Stacked patterns (upper_cross + forward_head) produce no duplicate
 *      exercises within a session.
 *   7. Same inputs + same seed = identical program.
 *
 * One of these (core-always-last) was deliberately broken and confirmed
 * to fail before being restored — see this session's report to the user
 * for the transcript; not left in the codebase as a permanent toggle.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { loadCorrectiveExercisePool } from '../lib/corrective-engine/exercisePool';
import { generateCorrectiveProgramDraft } from '../lib/corrective-engine/programGenerator';
import { CORRECTIVE_BLUEPRINTS } from '../lib/corrective-engine/blueprints';
import type { CorrectiveExercise, DetectedPattern } from '../lib/corrective-engine/types';

const ALL_BLUEPRINT_PATTERNS: { patterns: DetectedPattern[]; label: string }[] = [
  { label: 'lower_cross mild', patterns: [{ blueprint: 'lower_cross', severity: 'mild', supportingFindingIds: [] }] },
  { label: 'lower_cross moderate', patterns: [{ blueprint: 'lower_cross', severity: 'moderate', supportingFindingIds: [] }] },
  { label: 'upper_cross severe', patterns: [{ blueprint: 'upper_cross', severity: 'severe', supportingFindingIds: [] }] },
  { label: 'forward_head moderate', patterns: [{ blueprint: 'forward_head', severity: 'moderate', supportingFindingIds: [] }] },
  { label: 'flat_back mild', patterns: [{ blueprint: 'flat_back', severity: 'mild', supportingFindingIds: [] }] },
  {
    label: 'upper_cross + forward_head stacked, severe',
    patterns: [
      { blueprint: 'upper_cross', severity: 'severe', supportingFindingIds: [] },
      { blueprint: 'forward_head', severity: 'moderate', supportingFindingIds: [] },
    ],
  },
];

let pool: CorrectiveExercise[];
let spinalFlexionExternalIds: Set<string>;

beforeAll(async () => {
  const supabase = serviceRoleClient();
  pool = await loadCorrectiveExercisePool(supabase);

  // Loaded separately (bypassing exercisePool.ts's own exclusion) so the
  // "no spinal-flexion exercise ever appears" test proves the exclusion is
  // real, not just that no candidate happened to be picked.
  const { data, error } = await supabase
    .from('mef_exercise_metadata')
    .select('external_id')
    .eq('spinal_flexion_core', true);
  if (error) throw error;
  spinalFlexionExternalIds = new Set((data ?? []).map((r: { external_id: string }) => r.external_id));
  expect(spinalFlexionExternalIds.size).toBeGreaterThan(0);
});

function poolByExternalId(externalId: string): CorrectiveExercise {
  const found = pool.find((e) => e.externalId === externalId);
  if (!found) throw new Error(`Exercise ${externalId} not found in pool — test setup bug.`);
  return found;
}

describe('corrective program generator — hard rules', () => {
  for (const { label, patterns } of ALL_BLUEPRINT_PATTERNS) {
    describe(label, () => {
      const draft = () =>
        generateCorrectiveProgramDraft({ patterns, daysPerWeek: 3, seed: `guard-test:${label}`, pool });

      it('never includes a spinal_flexion_core exercise', () => {
        for (const session of draft().weeklySessions) {
          for (const block of session.blocks) {
            for (const exercise of block.exercises) {
              expect(spinalFlexionExternalIds.has(exercise.externalId)).toBe(false);
            }
          }
        }
      });

      it('never places a stretch/mobility pick against any active blueprint\'s LONG muscle', () => {
        const longLabels = new Set(
          patterns.flatMap((p) => CORRECTIVE_BLUEPRINTS[p.blueprint].longMuscles.flatMap((s) => s.canonicalLabels))
        );
        for (const session of draft().weeklySessions) {
          for (const block of session.blocks) {
            if (block.block !== 'release' && block.block !== 'mobility') continue;
            for (const exercise of block.exercises) {
              const full = poolByExternalId(exercise.externalId);
              const overlap = full.musclesStretched.filter((m) => longLabels.has(m));
              expect(overlap).toEqual([]);
            }
          }
        }
      });

      it('always ends each session with the core block', () => {
        for (const session of draft().weeklySessions) {
          const last = session.blocks[session.blocks.length - 1];
          expect(last?.block).toBe('core');
        }
      });

      it('keeps every session between 8 and 12 exercises', () => {
        for (const session of draft().weeklySessions) {
          const total = session.blocks.reduce((sum, b) => sum + b.exercises.length, 0);
          expect(total).toBeGreaterThanOrEqual(8);
          expect(total).toBeLessThanOrEqual(12);
        }
      });

      it('produces no duplicate exercises within a session', () => {
        for (const session of draft().weeklySessions) {
          const ids = session.blocks.flatMap((b) => b.exercises.map((e) => e.externalId));
          expect(new Set(ids).size).toBe(ids.length);
        }
      });

      it('same inputs + same seed produce an identical program', () => {
        const a = generateCorrectiveProgramDraft({ patterns, daysPerWeek: 3, seed: `repro:${label}`, pool });
        const b = generateCorrectiveProgramDraft({ patterns, daysPerWeek: 3, seed: `repro:${label}`, pool });
        expect(a).toEqual(b);
      });
    });
  }

  it('severe overall severity has no strength block for weeks 1-4 (i.e. this whole generated phase)', () => {
    const draft = generateCorrectiveProgramDraft({
      patterns: [{ blueprint: 'upper_cross', severity: 'severe', supportingFindingIds: [] }],
      daysPerWeek: 2,
      seed: 'severe-no-strength',
      pool,
    });
    expect(draft.overallSeverity).toBe('severe');
    for (const session of draft.weeklySessions) {
      expect(session.blocks.some((b) => b.block === 'strength')).toBe(false);
    }
  });

  it('mild severity includes a full strength block', () => {
    const draft = generateCorrectiveProgramDraft({
      patterns: [{ blueprint: 'lower_cross', severity: 'mild', supportingFindingIds: [] }],
      daysPerWeek: 2,
      seed: 'mild-has-strength',
      pool,
    });
    for (const session of draft.weeklySessions) {
      const strength = session.blocks.find((b) => b.block === 'strength');
      expect(strength).toBeDefined();
      expect(strength!.exercises.length).toBeGreaterThan(0);
    }
  });

  it('a different seed can select a different set of exercises for the same inputs', () => {
    const patterns: DetectedPattern[] = [{ blueprint: 'lower_cross', severity: 'moderate', supportingFindingIds: [] }];
    const a = generateCorrectiveProgramDraft({ patterns, daysPerWeek: 3, seed: 'variety-seed-a', pool });
    const b = generateCorrectiveProgramDraft({ patterns, daysPerWeek: 3, seed: 'variety-seed-b', pool });
    const idsA = a.weeklySessions.flatMap((s) => s.blocks.flatMap((bl) => bl.exercises.map((e) => e.externalId)));
    const idsB = b.weeklySessions.flatMap((s) => s.blocks.flatMap((bl) => bl.exercises.map((e) => e.externalId)));
    expect(idsA).not.toEqual(idsB);
  });
});
