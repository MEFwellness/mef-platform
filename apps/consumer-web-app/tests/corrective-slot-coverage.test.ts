/**
 * The slots nothing can fill, and the sentence a coach reads about them.
 *
 * lib/corrective-engine/coverage.ts is a third re-derivation of the
 * blueprint rules, alongside sessionBuilder.ts (what goes in) and
 * blockQualification.ts (what a coach may swap in). Three implementations
 * of one rule set drift, so this cross-checks it EMPIRICALLY against real
 * generation runs rather than by reading it: a slot coverage.ts calls a
 * gap must never receive an exercise in any real program, at any severity.
 * If the two ever disagree, this goes red.
 *
 * It also pins the gaps the library genuinely has today, so the day one of
 * them closes, the change is noticed here rather than discovered on a
 * coach screen.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { loadCorrectiveExercisePool } from '../lib/corrective-engine/exercisePool';
import { generateCorrectiveProgramDraft } from '../lib/corrective-engine/programGenerator';
import { findSlotCoverageGaps, describeBlockGap } from '../lib/corrective-engine/coverage';
import { CORRECTIVE_BLUEPRINTS } from '../lib/corrective-engine/blueprints';
import { BLUEPRINT_KEYS } from '../lib/corrective-engine/types';
import type {
  BlueprintKey,
  CorrectiveExercise,
  CorrectiveSeverity,
  DetectedPattern,
} from '../lib/corrective-engine/types';

const SEVERITIES: CorrectiveSeverity[] = ['mild', 'moderate', 'severe'];

let pool: CorrectiveExercise[];

beforeAll(async () => {
  pool = await loadCorrectiveExercisePool(serviceRoleClient());
  expect(pool.length).toBeGreaterThan(0);
});

function patternsFor(blueprint: BlueprintKey, severity: CorrectiveSeverity): DetectedPattern[] {
  return [{ blueprint, severity, supportingFindingIds: [] }];
}

describe('a reported gap is a real gap', () => {
  for (const blueprint of BLUEPRINT_KEYS) {
    it(`${blueprint}: no exercise the generator picks belongs to a slot reported as a gap`, () => {
      const gaps = findSlotCoverageGaps(pool, patternsFor(blueprint, 'moderate'));
      const bp = CORRECTIVE_BLUEPRINTS[blueprint];

      // The canonical labels of every gapped slot, per block.
      const gappedLabels = new Map<string, Set<string>>();
      for (const gap of gaps) {
        const slot =
          bp.tightMuscles.find((s) => s.muscle === gap.muscle) ??
          bp.longMuscles.find((s) => s.muscle === gap.muscle);
        if (!slot) continue;
        const set = gappedLabels.get(gap.block) ?? new Set<string>();
        for (const label of slot.canonicalLabels) set.add(label);
        gappedLabels.set(gap.block, set);
      }

      for (const severity of SEVERITIES) {
        const draft = generateCorrectiveProgramDraft({
          patterns: patternsFor(blueprint, severity),
          daysPerWeek: 3,
          seed: `coverage:${blueprint}:${severity}`,
          pool,
        });

        for (const session of draft.weeklySessions) {
          for (const block of session.blocks) {
            const labels = gappedLabels.get(block.block);
            if (!labels) continue;
            const field =
              block.block === 'release' || block.block === 'mobility'
                ? 'musclesStretched'
                : 'musclesStrengthened';
            for (const picked of block.exercises) {
              const full = pool.find((e) => e.externalId === picked.externalId)!;
              for (const label of full[field]) {
                expect(
                  labels.has(label),
                  `${blueprint}/${severity}: ${picked.exerciseName} filled ${block.block} slot "${label}" which was reported as a gap`
                ).toBe(false);
              }
            }
          }
        }
      }
    });
  }
});

describe('the gaps the library actually has today', () => {
  it('Forward Head cannot fill its Stability block at all', () => {
    const gaps = findSlotCoverageGaps(pool, patternsFor('forward_head', 'moderate'));
    const stability = gaps.filter((g) => g.block === 'stability').map((g) => g.muscle).sort();
    // Both of Forward Head's long muscles. This is what keeps the whole
    // pattern undeliverable until videos are recorded.
    expect(stability).toEqual(['deep neck flexors', 'thoracic extensors']);
  });

  it('Forward Head genuinely produces an empty Stability block, which is what the notice explains', () => {
    const draft = generateCorrectiveProgramDraft({
      patterns: patternsFor('forward_head', 'moderate'),
      daysPerWeek: 2,
      seed: 'coverage:forward-head-empty',
      pool,
    });
    for (const session of draft.weeklySessions) {
      const stability = session.blocks.find((b) => b.block === 'stability');
      expect(stability?.exercises ?? []).toHaveLength(0);
    }
  });

  it('Upper Cross cannot reach levator scapulae, and Lower Cross cannot reach TFL', () => {
    const upper = findSlotCoverageGaps(pool, patternsFor('upper_cross', 'moderate'));
    expect(upper.some((g) => g.muscle === 'levator scapulae')).toBe(true);

    const lower = findSlotCoverageGaps(pool, patternsFor('lower_cross', 'moderate'));
    expect(lower.some((g) => g.muscle === 'TFL')).toBe(true);
  });

  it('Lower Cross and Flat Back still fill their Stability blocks, so the gap report is not just "everything"', () => {
    for (const blueprint of ['lower_cross', 'flat_back'] as const) {
      const gaps = findSlotCoverageGaps(pool, patternsFor(blueprint, 'moderate'));
      expect(gaps.filter((g) => g.block === 'stability')).toHaveLength(0);
    }
  });

  it('core stability is never reported as a gap, because assignable core work exists', () => {
    for (const blueprint of BLUEPRINT_KEYS) {
      const gaps = findSlotCoverageGaps(pool, patternsFor(blueprint, 'moderate'));
      expect(gaps.filter((g) => g.block === 'core')).toHaveLength(0);
    }
  });
});

describe('what the coach is actually shown', () => {
  it('names the muscles and says why, in one plain sentence', () => {
    const gaps = findSlotCoverageGaps(pool, patternsFor('forward_head', 'moderate'));
    const sentence = describeBlockGap(gaps, 'stability');
    expect(sentence).toContain('No video-backed exercise is available yet');
    expect(sentence).toContain('deep neck flexors');
    expect(sentence).toContain('thoracic extensors');
    expect(sentence).not.toContain('—');
  });

  it('says nothing at all about a block that is fully covered', () => {
    const gaps = findSlotCoverageGaps(pool, patternsFor('lower_cross', 'moderate'));
    expect(describeBlockGap(gaps, 'stability')).toBeNull();
    expect(describeBlockGap(gaps, 'core')).toBeNull();
  });

  it('never speaks about the Strength block, which has no slot to fail to fill', () => {
    for (const blueprint of BLUEPRINT_KEYS) {
      const gaps = findSlotCoverageGaps(pool, patternsFor(blueprint, 'moderate'));
      expect(describeBlockGap(gaps, 'strength')).toBeNull();
    }
  });

  it('reads correctly for a single missing slot as well as several', () => {
    const one = findSlotCoverageGaps(pool, patternsFor('lower_cross', 'moderate'));
    const sentence = describeBlockGap(one, 'release');
    expect(sentence).toBeTruthy();
    expect(sentence).toContain('TFL');
  });
});
