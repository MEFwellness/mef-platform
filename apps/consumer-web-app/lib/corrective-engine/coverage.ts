/**
 * Which muscle slots this program cannot fill, and saying so out loud.
 *
 * THE PROBLEM THIS EXISTS FOR. Four of the blueprint's muscle slots have
 * no client-assignable exercise behind them at all: suboccipitals and
 * levator scapulae and TFL on the tight side, deep neck flexors and
 * thoracic extensors on the long side. MEF has written exercises for
 * several of them, and none of those exercises has a video, so none may be
 * given to a member (migration 170). Until now the generator simply
 * produced a shorter block and said nothing, so a coach reading a Forward
 * Head draft saw a Stability block with nothing in it and no reason why.
 * A thin program with no explanation is worse than a gap that is named.
 *
 * WHAT A GAP MEANS HERE, EXACTLY. A slot is reported when NOT ONE exercise
 * in the pool could ever fill it for that block, ignoring budgets and
 * ignoring what other slots already took. A slot that lost out to another
 * slot because the block only had room for two is not a gap: it is a
 * choice, and reporting it would train a coach to ignore this notice.
 *
 * RELATIONSHIP TO THE OTHER TWO FILES. sessionBuilder.ts decides what goes
 * in; blockQualification.ts decides what a coach may swap in; this decides
 * what could never have gone in. All three read the same blueprints and
 * apply the same role/muscle/long-muscle rules, and
 * tests/corrective-slot-coverage.test.ts cross-checks this one against
 * real generation runs: a slot this file calls a gap must never receive an
 * exercise in any real run, at any severity.
 */
import type { CorrectiveExercise, DetectedPattern, MuscleSlot, SessionBlockType } from './types';
import type { CorrectiveRole } from '../exercise-library/correctiveClassification';
import { CORRECTIVE_BLUEPRINTS } from './blueprints';

/** One slot nothing can fill, and which pattern asked for it. */
export interface SlotCoverageGap {
  block: SessionBlockType;
  /** The blueprint's own name for the muscle, e.g. "suboccipitals". */
  muscle: string;
  /** Blueprint names that list this slot, e.g. ["Forward Head"]. */
  blueprintNames: string[];
}

/** Every LONG muscle label across every active pattern — the hard "never stretch a long muscle" backstop sessionBuilder applies to Release and Mobility. */
function allLongLabels(patterns: DetectedPattern[]): Set<string> {
  return new Set(
    patterns.flatMap((p) =>
      CORRECTIVE_BLUEPRINTS[p.blueprint].longMuscles.flatMap((s) => s.canonicalLabels)
    )
  );
}

function slotsWithBlueprints(
  patterns: DetectedPattern[],
  pick: (key: DetectedPattern['blueprint']) => MuscleSlot[]
): { slot: MuscleSlot; blueprintNames: string[] }[] {
  const merged = new Map<string, { slot: MuscleSlot; blueprintNames: string[] }>();
  for (const pattern of patterns) {
    const blueprint = CORRECTIVE_BLUEPRINTS[pattern.blueprint];
    for (const slot of pick(pattern.blueprint)) {
      const key = slot.canonicalLabels.slice().sort().join('|');
      const existing = merged.get(key);
      if (existing) {
        if (!existing.blueprintNames.includes(blueprint.name)) {
          existing.blueprintNames.push(blueprint.name);
        }
      } else {
        merged.set(key, { slot, blueprintNames: [blueprint.name] });
      }
    }
  }
  return Array.from(merged.values());
}

function hasCandidate(
  pool: CorrectiveExercise[],
  slot: MuscleSlot,
  roles: CorrectiveRole[],
  targetField: 'musclesStretched' | 'musclesStrengthened',
  excludeLabels: Set<string>
): boolean {
  return pool.some(
    (e) =>
      roles.some((r) => e.correctiveRoles.includes(r)) &&
      e[targetField].some((m) => slot.canonicalLabels.includes(m)) &&
      e[targetField].every((m) => !excludeLabels.has(m))
  );
}

/**
 * Every slot no assignable exercise can fill, for the patterns given.
 *
 * The Strength block is deliberately absent: it draws from the whole
 * strength-role pool rather than from a blueprint slot, so it has no slot
 * to be unable to fill. The Core block IS included, as a single entry with
 * no muscle name, because a program with no core-stability exercise at all
 * is exactly the kind of silent thinning this exists to surface.
 */
export function findSlotCoverageGaps(
  pool: CorrectiveExercise[],
  patterns: DetectedPattern[]
): SlotCoverageGap[] {
  if (patterns.length === 0) return [];

  const longLabels = allLongLabels(patterns);
  const gaps: SlotCoverageGap[] = [];

  const tight = slotsWithBlueprints(patterns, (key) => CORRECTIVE_BLUEPRINTS[key].tightMuscles);
  for (const { slot, blueprintNames } of tight) {
    if (!hasCandidate(pool, slot, ['release'], 'musclesStretched', longLabels)) {
      gaps.push({ block: 'release', muscle: slot.muscle, blueprintNames });
    }
    if (!hasCandidate(pool, slot, ['stretch', 'mobility'], 'musclesStretched', longLabels)) {
      gaps.push({ block: 'mobility', muscle: slot.muscle, blueprintNames });
    }
  }

  // Stability draws from the long muscles, minus the slots a blueprint
  // reserves for core-stability work specifically — exactly the set
  // buildSession passes into its Stability pickForSlots call.
  const long = slotsWithBlueprints(patterns, (key) => {
    const bp = CORRECTIVE_BLUEPRINTS[key];
    const coreOnly = new Set(bp.coreStabilityOnlySlots ?? []);
    return bp.longMuscles.filter((s) => !coreOnly.has(s.muscle));
  });
  for (const { slot, blueprintNames } of long) {
    if (
      !hasCandidate(pool, slot, ['stability', 'strength'], 'musclesStrengthened', new Set())
    ) {
      gaps.push({ block: 'stability', muscle: slot.muscle, blueprintNames });
    }
  }

  if (!pool.some((e) => e.correctiveRoles.includes('core_stability'))) {
    gaps.push({
      block: 'core',
      muscle: 'core stability',
      blueprintNames: patterns.map((p) => CORRECTIVE_BLUEPRINTS[p.blueprint].name),
    });
  }

  return gaps;
}

/**
 * The sentence a coach reads, for one block. Returns null when that block
 * has no gap, so the caller renders nothing rather than an empty notice.
 *
 * States the cause, because "not available" on its own reads as a bug and
 * this is not one: the exercise exists, it has not been filmed.
 */
export function describeBlockGap(
  gaps: SlotCoverageGap[],
  block: SessionBlockType
): string | null {
  const forBlock = gaps.filter((g) => g.block === block);
  if (forBlock.length === 0) return null;

  if (block === 'core') {
    return 'No video-backed core stability exercise is available yet, so this block is empty.';
  }

  const muscles = forBlock.map((g) => g.muscle);
  const list =
    muscles.length === 1
      ? muscles[0]!
      : `${muscles.slice(0, -1).join(', ')} and ${muscles[muscles.length - 1]!}`;
  return `No video-backed exercise is available yet for ${list}, so ${
    muscles.length === 1 ? 'that slot is' : 'those slots are'
  } not filled.`;
}
