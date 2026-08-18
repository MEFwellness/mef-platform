/**
 * The two approved label fixes, proved against the real catalog.
 *
 * Candidate 1 (migration 171): Quadriceps Roll is the only
 * client-assignable exercise carrying the `release` role, and its
 * muscles_stretched array was empty, so the Release block had zero
 * candidates system-wide and every generated program opened with an empty
 * first block. It now names the muscles it plainly rolls.
 *
 * Candidate 2 (blueprints.ts): the Lower Cross TFL slot asked for the
 * label "TFL", which only the three unfilmable MEF rows use, while every
 * video-backed row spells out "tensor fasciae latae". Both spellings are
 * canonical for that slot now.
 *
 * Candidates 3 to 12 were NOT applied, and one assertion below holds that
 * line: the slots that were left alone are still reported as gaps.
 *
 * Everything here runs against the same pool loader the generator uses, so
 * it is measuring what the engine actually sees.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { loadCorrectiveExercisePool } from '../lib/corrective-engine/exercisePool';
import { generateCorrectiveProgramDraft } from '../lib/corrective-engine/programGenerator';
import { findSlotCoverageGaps } from '../lib/corrective-engine/coverage';
import { CORRECTIVE_BLUEPRINTS } from '../lib/corrective-engine/blueprints';
import type {
  CorrectiveExercise,
  CorrectiveSeverity,
  DetectedPattern,
} from '../lib/corrective-engine/types';

const QUADRICEPS_ROLL = 'cc3a2bb8-efcf-440d-9357-887ce0b04346';
const SEVERITIES: CorrectiveSeverity[] = ['mild', 'moderate', 'severe'];

let pool: CorrectiveExercise[];

beforeAll(async () => {
  pool = await loadCorrectiveExercisePool(serviceRoleClient());
  expect(pool.length).toBeGreaterThan(0);
});

function patterns(blueprint: DetectedPattern['blueprint'], severity: CorrectiveSeverity): DetectedPattern[] {
  return [{ blueprint, severity, supportingFindingIds: [] }];
}

describe('candidate 1: the Release block can be filled again', () => {
  it('Quadriceps Roll is in the assignable pool and names the muscles it releases', () => {
    const exercise = pool.find((e) => e.externalId === QUADRICEPS_ROLL);
    expect(exercise, 'Quadriceps Roll is not in the pool at all').toBeDefined();
    expect(exercise!.correctiveRoles).toContain('release');
    expect(exercise!.musclesStretched).toContain('hip flexors');
    expect(exercise!.musclesStretched).toContain('quads');
  });

  it('does not list the same muscle as both stretched and strengthened', () => {
    // Migration 127's no-overlap constraint, re-asserted from the
    // application's side because migration 171 had to move two entries
    // out of muscles_strengthened to satisfy it.
    const exercise = pool.find((e) => e.externalId === QUADRICEPS_ROLL)!;
    for (const muscle of exercise.musclesStretched) {
      expect(exercise.musclesStrengthened, `${muscle} is in both arrays`).not.toContain(muscle);
    }
  });

  it('Lower Cross now generates a Release block with at least one video-backed exercise, at every severity', () => {
    for (const severity of SEVERITIES) {
      const draft = generateCorrectiveProgramDraft({
        patterns: patterns('lower_cross', severity),
        daysPerWeek: 3,
        seed: `release-fill:${severity}`,
        pool,
      });

      for (const session of draft.weeklySessions) {
        const release = session.blocks.find((b) => b.block === 'release');
        expect(release, `${severity}: no Release block at all`).toBeDefined();
        expect(
          release!.exercises.length,
          `${severity}/${session.label}: Release block is still empty`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('the Release slot it fills is a tight-muscle slot of the pattern it serves', () => {
    const gaps = findSlotCoverageGaps(pool, patterns('lower_cross', 'moderate'));
    const releaseGaps = gaps.filter((g) => g.block === 'release').map((g) => g.muscle);
    // Hip flexors was a gap before this fix. It is not one now.
    expect(releaseGaps).not.toContain('hip flexors');
  });

  it('is still correctly withheld from Flat Back, whose long muscles include hip flexors', () => {
    // Not a regression: the engine's hard "never stretch a long muscle"
    // rule outranks a filled slot, and hip flexors are LONG for Flat Back.
    const flatBack = CORRECTIVE_BLUEPRINTS.flat_back.longMuscles.flatMap((s) => s.canonicalLabels);
    expect(flatBack).toContain('hip flexors');

    for (const severity of SEVERITIES) {
      const draft = generateCorrectiveProgramDraft({
        patterns: patterns('flat_back', severity),
        daysPerWeek: 2,
        seed: `release-flatback:${severity}`,
        pool,
      });
      for (const session of draft.weeklySessions) {
        for (const block of session.blocks) {
          if (block.block !== 'release' && block.block !== 'mobility') continue;
          expect(
            block.exercises.some((e) => e.externalId === QUADRICEPS_ROLL),
            'Quadriceps Roll was given to a Flat Back member'
          ).toBe(false);
        }
      }
    }
  });
});

describe('candidate 2: the TFL slot fills', () => {
  it('the blueprint accepts both spellings of the same muscle', () => {
    const slot = CORRECTIVE_BLUEPRINTS.lower_cross.tightMuscles.find((s) => s.muscle === 'TFL');
    expect(slot!.canonicalLabels).toContain('TFL');
    expect(slot!.canonicalLabels).toContain('tensor fasciae latae');
  });

  it('at least one assignable exercise stretches it, which was the whole problem', () => {
    const candidates = pool.filter(
      (e) =>
        e.musclesStretched.includes('tensor fasciae latae') &&
        (e.correctiveRoles.includes('stretch') || e.correctiveRoles.includes('mobility'))
    );
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('Mobility is no longer reported as unfillable for TFL', () => {
    const gaps = findSlotCoverageGaps(pool, patterns('lower_cross', 'moderate'));
    const mobilityGaps = gaps.filter((g) => g.block === 'mobility').map((g) => g.muscle);
    expect(mobilityGaps).not.toContain('TFL');
  });

  it('a real Lower Cross program actually reaches TFL through its Mobility block', () => {
    const reached = SEVERITIES.some((severity) => {
      const draft = generateCorrectiveProgramDraft({
        patterns: patterns('lower_cross', severity),
        daysPerWeek: 3,
        seed: `tfl-fill:${severity}`,
        pool,
      });
      return draft.weeklySessions.some((session) =>
        session.blocks.some(
          (block) =>
            block.block === 'mobility' &&
            block.exercises.some((picked) => {
              const full = pool.find((e) => e.externalId === picked.externalId);
              return full?.musclesStretched.includes('tensor fasciae latae') ?? false;
            })
        )
      );
    });
    expect(reached, 'no Lower Cross session reached the TFL slot at any severity').toBe(true);
  });
});

describe('candidates 3 to 12 were left alone', () => {
  it('the slots awaiting clinical review are still reported as gaps', () => {
    const forwardHead = findSlotCoverageGaps(pool, patterns('forward_head', 'moderate'));
    const upperCross = findSlotCoverageGaps(pool, patterns('upper_cross', 'moderate'));

    // Candidates 7 to 9 (thoracic extensors) and the deep neck flexor
    // recordings: still zero.
    expect(forwardHead.some((g) => g.muscle === 'thoracic extensors')).toBe(true);
    expect(forwardHead.some((g) => g.muscle === 'deep neck flexors')).toBe(true);
    // Candidates 3, 4 (levator scapulae) and 10, 11 (serratus anterior).
    expect(upperCross.some((g) => g.muscle === 'levator scapulae')).toBe(true);
    expect(upperCross.some((g) => g.muscle === 'serratus anterior')).toBe(true);
  });

  it('Release for TFL and lumbar erectors is still a gap, because no assignable release exercise reaches them', () => {
    const gaps = findSlotCoverageGaps(pool, patterns('lower_cross', 'moderate'));
    const releaseGaps = gaps.filter((g) => g.block === 'release').map((g) => g.muscle);
    expect(releaseGaps).toContain('TFL');
    expect(releaseGaps).toContain('lumbar erectors');
  });
});
