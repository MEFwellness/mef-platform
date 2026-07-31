/**
 * Re-exposes sessionBuilder.ts's per-block qualification rules as a single
 * predicate, `qualifiesForBlock`, so the Corrective Programs coach review
 * screen's swap/add picker can default to only offering exercises that
 * would have been valid engine picks for that block — "correct corrective
 * role and muscles, all engine rules respected" per the task.
 *
 * This is a faithful re-derivation of buildSession()'s own candidate
 * filters (lib/corrective-engine/sessionBuilder.ts), not a second
 * implementation invented independently — every branch below mirrors the
 * exact `roles`/`targetField`/slot-label checks buildSession passes to
 * pickForSlots/pickStrengthBlock/pickCoreBlock. sessionBuilder.ts itself
 * is left untouched (55 existing guard tests stay green, zero regression
 * risk to the generator) — instead,
 * tests/corrective-engine-block-qualification.test.ts cross-checks the two
 * empirically: every exercise a real generation run actually places in a
 * block is asserted to satisfy qualifiesForBlock() for that same block,
 * across every pattern/severity combination the engine's own suite covers.
 * If the two ever drift, that cross-check goes red.
 */
import type { CorrectiveExercise, DetectedPattern, SessionBlockType } from './types';
import { CORRECTIVE_BLUEPRINTS } from './blueprints';

function tightLabels(patterns: DetectedPattern[]): Set<string> {
  return new Set(
    patterns.flatMap((p) => CORRECTIVE_BLUEPRINTS[p.blueprint].tightMuscles.flatMap((s) => s.canonicalLabels))
  );
}

/** Long-muscle labels, excluding a blueprint's core-stability-only slots (e.g. Lower Cross's TVA) — matches the `long` set buildSession() passes into the Stability block's pickForSlots call. */
function stabilityLongLabels(patterns: DetectedPattern[]): Set<string> {
  return new Set(
    patterns.flatMap((p) => {
      const bp = CORRECTIVE_BLUEPRINTS[p.blueprint];
      const coreOnly = new Set(bp.coreStabilityOnlySlots ?? []);
      return bp.longMuscles.filter((s) => !coreOnly.has(s.muscle)).flatMap((s) => s.canonicalLabels);
    })
  );
}

/** Every LONG muscle label across every active pattern, including core-stability-only slots — matches buildSession()'s `allLongLabels`, the hard "never stretch a LONG muscle" backstop for Release/Mobility. */
function allLongLabels(patterns: DetectedPattern[]): Set<string> {
  return new Set(
    patterns.flatMap((p) => CORRECTIVE_BLUEPRINTS[p.blueprint].longMuscles.flatMap((s) => s.canonicalLabels))
  );
}

/** Whether `exercise` would have been a valid engine candidate for `block`, given the member's currently active detected patterns. Severity is irrelevant to qualification (it only ever affects how many exercises per block, never which ones are eligible), so callers may synthesize patterns with any severity value when only the blueprint keys are known (e.g. from a saved template's `corrective_tags`). */
export function qualifiesForBlock(
  exercise: CorrectiveExercise,
  block: SessionBlockType,
  patterns: DetectedPattern[]
): boolean {
  if (patterns.length === 0) return false;

  switch (block) {
    case 'release': {
      const tight = tightLabels(patterns);
      const long = allLongLabels(patterns);
      return (
        exercise.correctiveRoles.includes('release') &&
        exercise.musclesStretched.some((m) => tight.has(m)) &&
        exercise.musclesStretched.every((m) => !long.has(m))
      );
    }
    case 'mobility': {
      const tight = tightLabels(patterns);
      const long = allLongLabels(patterns);
      return (
        (exercise.correctiveRoles.includes('stretch') || exercise.correctiveRoles.includes('mobility')) &&
        exercise.musclesStretched.some((m) => tight.has(m)) &&
        exercise.musclesStretched.every((m) => !long.has(m))
      );
    }
    case 'stability': {
      const long = stabilityLongLabels(patterns);
      return (
        (exercise.correctiveRoles.includes('stability') || exercise.correctiveRoles.includes('strength')) &&
        exercise.musclesStrengthened.some((m) => long.has(m))
      );
    }
    case 'strength':
      return exercise.correctiveRoles.includes('strength');
    case 'core':
      return exercise.correctiveRoles.includes('core_stability');
    default:
      return false;
  }
}
