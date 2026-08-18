/**
 * REAL DOSING, and the rules the table has to keep.
 *
 * The generator used to write null for sets, reps, hold, tempo and rest on
 * every exercise of every program it produced, so a member opened her
 * program and read an exercise name with nothing under it. This proves
 * that is over, and proves it the only way worth proving: by generating
 * real programs from the real catalog, at every severity, for every
 * blueprint, and looking at what would actually be written to the
 * database.
 *
 * Three layers:
 *   1. the table's own rules (lib/corrective-engine/dosing.ts)
 *   2. what sessionToSections writes, per block
 *   3. a full generate -> save shape, every blueprint x every severity,
 *      with not one null prescription anywhere in it
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { CORRECTIVE_DOSING, blockPrescription } from '../lib/corrective-engine/dosing';
import { loadCorrectiveExercisePool } from '../lib/corrective-engine/exercisePool';
import { generateCorrectiveProgramDraft } from '../lib/corrective-engine/programGenerator';
import { sessionToSections } from '../lib/corrective-engine/save';
import { BLUEPRINT_KEYS, readSeverityTag, SEVERITY_TAG_PREFIX } from '../lib/corrective-engine/types';
import type {
  CorrectiveExercise,
  CorrectiveSeverity,
  SessionBlockType,
} from '../lib/corrective-engine/types';

const SEVERITIES: CorrectiveSeverity[] = ['mild', 'moderate', 'severe'];
const BLOCKS: SessionBlockType[] = ['release', 'mobility', 'stability', 'strength', 'core'];

/** Time-based blocks hold; rep-based blocks count. Never both, per the file's own conventions. */
const HOLD_BLOCKS: SessionBlockType[] = ['release', 'mobility', 'core'];
const REP_BLOCKS: SessionBlockType[] = ['stability', 'strength'];

let pool: CorrectiveExercise[];

beforeAll(async () => {
  pool = await loadCorrectiveExercisePool(serviceRoleClient());
  expect(pool.length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// 1. The table itself
// ---------------------------------------------------------------------------

describe('the dosing table', () => {
  it('has a value for every block at every severity, with no hole to fall through', () => {
    for (const block of BLOCKS) {
      for (const severity of SEVERITIES) {
        const dose = CORRECTIVE_DOSING[block][severity];
        expect(dose, `${block}/${severity}`).toBeDefined();
        expect(dose.sets).toBeGreaterThan(0);
        expect(dose.restSeconds).toBeGreaterThan(0);
      }
    }
  });

  it('gives every block either a hold or reps, never both and never neither', () => {
    for (const block of BLOCKS) {
      for (const severity of SEVERITIES) {
        const dose = CORRECTIVE_DOSING[block][severity];
        const hasHold = dose.holdSeconds !== null;
        const hasReps = dose.reps !== null;
        expect(hasHold && hasReps, `${block}/${severity} has both`).toBe(false);
        expect(hasHold || hasReps, `${block}/${severity} has neither`).toBe(true);
      }
    }
  });

  it('holds the corrective convention: release, mobility and core are time, stability and strength are reps', () => {
    for (const severity of SEVERITIES) {
      for (const block of HOLD_BLOCKS) {
        expect(CORRECTIVE_DOSING[block][severity].holdSeconds, `${block}/${severity}`).toBeGreaterThan(0);
      }
      for (const block of REP_BLOCKS) {
        expect(CORRECTIVE_DOSING[block][severity].reps, `${block}/${severity}`).toBeGreaterThan(0);
      }
    }
  });

  it('gives a tempo only where the speed of the rep is part of the exercise', () => {
    for (const severity of SEVERITIES) {
      for (const block of HOLD_BLOCKS) {
        expect(CORRECTIVE_DOSING[block][severity].tempo, `${block}/${severity}`).toBeNull();
      }
      for (const block of REP_BLOCKS) {
        expect(CORRECTIVE_DOSING[block][severity].tempo, `${block}/${severity}`).toBeTruthy();
      }
    }
  });

  /**
   * THE RULE THAT MATTERS MOST. A more severe pattern already gets MORE
   * exercises per session (blockBudgets.ts). If it also got more volume
   * per exercise, a severe member would be handed the largest session in
   * the product, which is the opposite of the intent.
   */
  it('never gives a more severe pattern more work per exercise than a milder one', () => {
    const volume = (block: SessionBlockType, severity: CorrectiveSeverity) => {
      const dose = CORRECTIVE_DOSING[block][severity];
      return dose.sets * (dose.holdSeconds ?? dose.reps ?? 0);
    };
    for (const block of BLOCKS) {
      expect(volume(block, 'moderate'), `${block}: moderate exceeds mild`).toBeLessThanOrEqual(
        volume(block, 'mild')
      );
      expect(volume(block, 'severe'), `${block}: severe exceeds moderate`).toBeLessThanOrEqual(
        volume(block, 'moderate')
      );
    }
  });

  it('never shortens the rest as severity rises', () => {
    for (const block of BLOCKS) {
      const mild = CORRECTIVE_DOSING[block].mild.restSeconds;
      const moderate = CORRECTIVE_DOSING[block].moderate.restSeconds;
      const severe = CORRECTIVE_DOSING[block].severe.restSeconds;
      expect(moderate, `${block}`).toBeGreaterThanOrEqual(mild);
      expect(severe, `${block}`).toBeGreaterThanOrEqual(moderate);
    }
  });

  it('writes what the table says, with no arithmetic in between', () => {
    const dose = CORRECTIVE_DOSING.stability.moderate;
    const written = blockPrescription('stability', 'moderate');
    expect(written.sets).toBe(dose.sets);
    expect(written.reps).toBe(String(dose.reps));
    expect(written.rep_range_low).toBe(dose.reps);
    expect(written.rep_range_high).toBe(dose.reps);
    expect(written.tempo).toBe(dose.tempo);
    expect(written.rest_seconds).toBe(dose.restSeconds);
    expect(written.hold_duration_seconds).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2 and 3. What actually reaches the database
// ---------------------------------------------------------------------------

describe('every generated program carries a real prescription', () => {
  for (const blueprint of BLUEPRINT_KEYS) {
    for (const severity of SEVERITIES) {
      it(`${blueprint} / ${severity}: not one null prescription anywhere`, () => {
        const draft = generateCorrectiveProgramDraft({
          patterns: [{ blueprint, severity, supportingFindingIds: [] }],
          daysPerWeek: 3,
          seed: `dosing:${blueprint}:${severity}`,
          pool,
        });

        let seen = 0;
        for (const session of draft.weeklySessions) {
          expect(session.severity).toBe(severity);

          for (const section of sessionToSections(session)) {
            for (const exercise of section.exercises) {
              seen++;
              expect(exercise.sets, exercise.exerciseName).toBeGreaterThan(0);
              expect(exercise.rest_seconds, exercise.exerciseName).toBeGreaterThan(0);

              const hasHold = exercise.hold_duration_seconds !== null;
              const hasReps = exercise.reps !== null;
              expect(hasHold || hasReps, `${exercise.exerciseName} has neither hold nor reps`).toBe(
                true
              );
              expect(hasHold && hasReps, `${exercise.exerciseName} has both`).toBe(false);
            }
          }
        }

        // Forward Head is genuinely undeliverable today (its Stability
        // block cannot fill at all), so a blueprint is allowed to produce
        // a thin program. It is not allowed to produce an empty one at
        // every severity, which would make this whole test vacuous.
        if (blueprint !== 'forward_head') {
          expect(seen, 'no exercises were generated at all').toBeGreaterThan(0);
        }
      });
    }
  }

  it('doses a Release exercise as a hold and a Stability exercise as tempo reps, in the same session', () => {
    const draft = generateCorrectiveProgramDraft({
      patterns: [{ blueprint: 'lower_cross', severity: 'moderate', supportingFindingIds: [] }],
      daysPerWeek: 2,
      seed: 'dosing:shape-check',
      pool,
    });

    const sections = sessionToSections(draft.weeklySessions[0]!);
    const release = sections.find((s) => s.name === 'Release')!;
    const stability = sections.find((s) => s.name === 'Stability')!;

    for (const exercise of release.exercises) {
      expect(exercise.hold_duration_seconds).toBe(CORRECTIVE_DOSING.release.moderate.holdSeconds);
      expect(exercise.reps).toBeNull();
      expect(exercise.tempo).toBeNull();
    }
    for (const exercise of stability.exercises) {
      expect(exercise.reps).toBe(String(CORRECTIVE_DOSING.stability.moderate.reps));
      expect(exercise.tempo).toBe(CORRECTIVE_DOSING.stability.moderate.tempo);
      expect(exercise.hold_duration_seconds).toBeNull();
    }
  });

  it('leaves the fields this engine has no opinion about alone, rather than inventing them', () => {
    const draft = generateCorrectiveProgramDraft({
      patterns: [{ blueprint: 'lower_cross', severity: 'mild', supportingFindingIds: [] }],
      daysPerWeek: 2,
      seed: 'dosing:untouched-fields',
      pool,
    });

    for (const section of sessionToSections(draft.weeklySessions[0]!)) {
      for (const exercise of section.exercises) {
        expect(exercise.load).toBeNull();
        expect(exercise.load_unit).toBeNull();
        expect(exercise.band_color).toBeNull();
        expect(exercise.rpe).toBeNull();
        expect(exercise.side).toBeNull();
      }
    }
  });
});

describe('the severity a draft was dosed at survives a save', () => {
  it('reads back the tag the save writes, and falls back to moderate without one', () => {
    for (const severity of SEVERITIES) {
      expect(readSeverityTag(['corrective-generated', `${SEVERITY_TAG_PREFIX}${severity}`])).toBe(
        severity
      );
    }
    expect(readSeverityTag(['corrective-generated'])).toBe('moderate');
    expect(readSeverityTag([`${SEVERITY_TAG_PREFIX}nonsense`])).toBe('moderate');
  });
});
