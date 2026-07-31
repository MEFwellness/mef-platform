/**
 * Builds one full-body session following the MEF Method's fixed 5-block
 * order: Release -> Mobility -> Stability -> Strength -> Core. This is
 * where every hard rule from the task lives, enforced structurally (by
 * which pool each block is allowed to draw from), not bolted on after the
 * fact:
 *
 *   - Release/Mobility only ever draw from a pattern's TIGHT muscles
 *     (musclesStretched) — a LONG muscle's stretch can never be selected
 *     because these blocks never look at musclesStrengthened at all.
 *   - Stability/Core only ever draw from LONG muscles (musclesStrengthened)
 *     — symmetric guarantee in the other direction.
 *   - spinal_flexion_core exercises never enter the pool passed in here
 *     (exercisePool.ts filters them out at the query level) — Core still
 *     re-asserts role === 'core_stability' explicitly as a second line of
 *     defense, since the DB check constraint already guarantees a
 *     spinal-flexion exercise can never carry that role anyway.
 *   - Core is always the last block built and appended last; Strength is
 *     omitted entirely (not just emptied) when its budget is 0.
 */
import type {
  CorrectiveExercise,
  DetectedPattern,
  MuscleSlot,
  SessionBlockDraft,
  SessionDraft,
  SessionExerciseDraft,
} from './types';
import type { CorrectiveRole } from '../exercise-library/correctiveClassification';
import { CORRECTIVE_BLUEPRINTS } from './blueprints';
import { BLOCK_BUDGETS } from './blockBudgets';
import { overallSeverity } from './patternMapping';
import { createRng, seededShuffle, type Rng } from './rng';

const LOWER_BODY_LABELS = new Set([
  'glutes', 'hamstrings', 'quads', 'hip flexors', 'calves', 'adductors', 'abductors', 'TFL',
]);
const UPPER_BODY_LABELS = new Set([
  'pecs', 'lats', 'upper traps', 'lower traps', 'mid traps', 'traps', 'rhomboids',
  'serratus anterior', 'shoulders', 'rotator cuff', 'biceps', 'triceps', 'forearms',
  'deep neck flexors', 'SCM', 'scalenes', 'levator scapulae', 'thoracic extensors',
  'cervical extensors', 'neck', 'upper back', 'back',
]);

interface PrioritizedSlot extends MuscleSlot {
  /** Blueprint names contributing this slot, worst-severity blueprint first — used only for reasoning text and pick order. */
  blueprintNames: string[];
}

/** Merges the tight (or long) muscle slots of every stacked, detected pattern into one priority-ordered list — worst-severity blueprint's slots first, duplicate muscles (identical canonical-label sets, e.g. Upper Cross's and Forward Head's shared "upper traps") collapsed into one slot. */
function mergeSlots(
  patterns: DetectedPattern[],
  pick: (blueprint: (typeof CORRECTIVE_BLUEPRINTS)[keyof typeof CORRECTIVE_BLUEPRINTS]) => MuscleSlot[]
): PrioritizedSlot[] {
  const bySeverityDesc = patterns
    .slice()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  const merged = new Map<string, PrioritizedSlot>();
  for (const pattern of bySeverityDesc) {
    const blueprint = CORRECTIVE_BLUEPRINTS[pattern.blueprint];
    for (const slot of pick(blueprint)) {
      const key = slot.canonicalLabels.slice().sort().join('|');
      const existing = merged.get(key);
      if (existing) {
        if (!existing.blueprintNames.includes(blueprint.name)) existing.blueprintNames.push(blueprint.name);
      } else {
        merged.set(key, { ...slot, blueprintNames: [blueprint.name] });
      }
    }
  }
  return Array.from(merged.values());
}

function severityRank(s: DetectedPattern['severity']): number {
  return s === 'severe' ? 3 : s === 'moderate' ? 2 : 1;
}

/** Defensive backstop for the "never stretch a LONG muscle" rule: if a stacked combination of blueprints somehow lists the same muscle as tight in one and long in another (not possible with today's 4 blueprints — verified by a guard test — but checked here so a future 5th blueprint can never silently violate it), drop that muscle from both merged lists rather than risk a violation. */
function dropConflicts(tight: PrioritizedSlot[], long: PrioritizedSlot[]): { tight: PrioritizedSlot[]; long: PrioritizedSlot[] } {
  const tightLabels = new Set(tight.flatMap((s) => s.canonicalLabels));
  const longLabels = new Set(long.flatMap((s) => s.canonicalLabels));
  const conflicting = new Set([...tightLabels].filter((l) => longLabels.has(l)));
  if (conflicting.size === 0) return { tight, long };
  const keep = (s: PrioritizedSlot) => !s.canonicalLabels.some((l) => conflicting.has(l));
  return { tight: tight.filter(keep), long: long.filter(keep) };
}

function bodyRegionOf(exercise: CorrectiveExercise): 'lower' | 'upper' | 'other' {
  if (exercise.musclesStrengthened.some((m) => LOWER_BODY_LABELS.has(m))) return 'lower';
  if (exercise.musclesStrengthened.some((m) => UPPER_BODY_LABELS.has(m))) return 'upper';
  return 'other';
}

function pickN<T>(candidates: T[], n: number, rng: Rng, keyOf: (t: T) => string): T[] {
  const stableSorted = candidates.slice().sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
  return seededShuffle(stableSorted, rng).slice(0, n);
}

/**
 * Round-robin selection across priority-ordered muscle slots: covers every
 * distinct slot once before doubling back for extra variety, so a stacked
 * program's worst pattern is never crowded out but every pattern gets at
 * least one pick when budget allows.
 *
 * `excludeLabels` is the hard-rule backstop for Release/Mobility: an
 * exercise can legitimately match a TIGHT-muscle slot (e.g. it stretches
 * hamstrings) while its own musclesStretched *also* includes one of the
 * pattern's LONG muscles (e.g. the same stretch also lengthens lumbar
 * erectors, Flat Back's long muscle) — matching the slot alone isn't
 * enough to prove the "never stretch a LONG muscle" rule; every one of the
 * candidate's target muscles must be checked, not just the one that
 * happened to satisfy the slot. Found by this engine's own guard test,
 * not assumed safe up front.
 */
function pickForSlots(
  pool: CorrectiveExercise[],
  slots: PrioritizedSlot[],
  roles: CorrectiveRole[],
  targetField: 'musclesStretched' | 'musclesStrengthened',
  budget: number,
  usedIds: Set<string>,
  rng: Rng,
  reasoningFor: (exercise: CorrectiveExercise, slot: PrioritizedSlot) => string,
  excludeLabels: Set<string> = new Set()
): SessionExerciseDraft[] {
  const picked: SessionExerciseDraft[] = [];
  if (budget <= 0 || slots.length === 0) return picked;

  const candidatesFor = (slot: PrioritizedSlot) =>
    pool.filter(
      (e) =>
        roles.some((r) => e.correctiveRoles.includes(r)) &&
        e[targetField].some((m) => slot.canonicalLabels.includes(m)) &&
        e[targetField].every((m) => !excludeLabels.has(m)) &&
        !usedIds.has(e.externalId)
    );

  let remaining = budget;
  let madeProgress = true;
  while (remaining > 0 && madeProgress) {
    madeProgress = false;
    for (const slot of slots) {
      if (remaining <= 0) break;
      const candidates = candidatesFor(slot);
      if (candidates.length === 0) continue;
      const [chosen] = pickN(candidates, 1, rng, (e) => e.externalId);
      if (!chosen) continue;
      usedIds.add(chosen.externalId);
      picked.push({
        provider: chosen.provider,
        externalId: chosen.externalId,
        exerciseName: chosen.name,
        coachingCues: chosen.coachingCues.length > 0 ? chosen.coachingCues.join(' ') : null,
        selectionReasoning: reasoningFor(chosen, slot),
      });
      remaining--;
      madeProgress = true;
    }
  }
  return picked;
}

function pickStrengthBlock(
  pool: CorrectiveExercise[],
  budget: number,
  usedIds: Set<string>,
  rng: Rng
): SessionExerciseDraft[] {
  if (budget <= 0) return [];

  const candidates = pool.filter((e) => e.correctiveRoles.includes('strength') && !usedIds.has(e.externalId));
  const lower = candidates.filter((e) => bodyRegionOf(e) === 'lower');
  const upper = candidates.filter((e) => bodyRegionOf(e) === 'upper');
  const other = candidates.filter((e) => bodyRegionOf(e) === 'other');

  const lowerCount = Math.min(lower.length, Math.max(1, Math.round(budget * 0.4)));
  let remaining = budget - lowerCount;
  const upperCount = Math.min(upper.length, remaining > 0 ? Math.max(1, Math.round(remaining * 0.6)) : 0);
  remaining -= upperCount;

  const chosenLower = pickN(lower, lowerCount, rng, (e) => e.externalId);
  for (const e of chosenLower) usedIds.add(e.externalId);
  const chosenUpper = pickN(
    upper.filter((e) => !usedIds.has(e.externalId)),
    upperCount,
    rng,
    (e) => e.externalId
  );
  for (const e of chosenUpper) usedIds.add(e.externalId);

  // Accessory tail: whatever's left over budget, preferring lower-strain
  // options first (an accessory finisher, not another taxing compound) —
  // picked low-strain-stratum-first, seeded within each stratum, so the
  // low-strain preference survives the shuffle instead of being erased by
  // a single flat pickN() over the whole remaining pool.
  const accessoryPool = [...lower, ...upper, ...other].filter((e) => !usedIds.has(e.externalId));
  const chosenAccessory: CorrectiveExercise[] = [];
  for (const strain of ['low', 'moderate', 'high'] as const) {
    if (chosenAccessory.length >= remaining) break;
    const stratum = accessoryPool.filter(
      (e) => e.strainLevel === strain && !chosenAccessory.includes(e)
    );
    chosenAccessory.push(...pickN(stratum, remaining - chosenAccessory.length, rng, (e) => e.externalId));
  }
  for (const e of chosenAccessory) usedIds.add(e.externalId);

  const toExercise = (e: CorrectiveExercise, reason: string) => ({
    provider: e.provider,
    externalId: e.externalId,
    exerciseName: e.name,
    coachingCues: e.coachingCues.length > 0 ? e.coachingCues.join(' ') : null,
    selectionReasoning: reason,
  });

  return [
    ...chosenLower.map((e) => toExercise(e, 'Lower-body compound work leads the Strength block.')),
    ...chosenUpper.map((e) => toExercise(e, 'Upper-body strength work, full-body session.')),
    ...chosenAccessory.map((e) => toExercise(e, 'Lower-strain accessory work closes the Strength block.')),
  ];
}

function pickCoreBlock(
  pool: CorrectiveExercise[],
  patterns: DetectedPattern[],
  budget: number,
  usedIds: Set<string>,
  rng: Rng
): SessionExerciseDraft[] {
  if (budget <= 0) return [];

  // Core is a hard rule: role must be exactly core_stability, never
  // anything else — re-asserted here even though the pool passed in has
  // already excluded every spinal_flexion_core exercise.
  const candidates = pool.filter((e) => e.correctiveRoles.includes('core_stability') && !usedIds.has(e.externalId));

  const priorityLabels = new Set(
    patterns.flatMap((p) => CORRECTIVE_BLUEPRINTS[p.blueprint].coreStabilityOnlySlots ?? [])
  );
  const priority = candidates.filter((e) => e.musclesStrengthened.some((m) => priorityLabels.has(m)));
  const rest = candidates.filter((e) => !priority.includes(e));

  const chosenPriority = pickN(priority, Math.min(priority.length, budget), rng, (e) => e.externalId);
  for (const e of chosenPriority) usedIds.add(e.externalId);
  const remaining = budget - chosenPriority.length;
  const chosenRest = pickN(
    rest.filter((e) => !usedIds.has(e.externalId)),
    remaining,
    rng,
    (e) => e.externalId
  );
  for (const e of chosenRest) usedIds.add(e.externalId);

  return [...chosenPriority, ...chosenRest].map((e) => ({
    provider: e.provider,
    externalId: e.externalId,
    exerciseName: e.name,
    coachingCues: e.coachingCues.length > 0 ? e.coachingCues.join(' ') : null,
    selectionReasoning: priorityLabels.size > 0 && e.musclesStrengthened.some((m) => priorityLabels.has(m))
      ? 'Core-stability work targeting this program’s deep-stabilizer focus.'
      : 'Anti-movement core-stability work, always the final block.',
  }));
}

export function buildSession(
  pool: CorrectiveExercise[],
  patterns: DetectedPattern[],
  seed: string,
  label: string
): SessionDraft {
  const severity = overallSeverity(patterns);
  const budget = BLOCK_BUDGETS[severity];
  const rng = createRng(seed);
  const usedIds = new Set<string>();

  const rawTight = mergeSlots(patterns, (bp) => bp.tightMuscles);
  const rawLong = mergeSlots(
    patterns,
    (bp) => bp.longMuscles.filter((slot) => !(bp.coreStabilityOnlySlots ?? []).includes(slot.muscle))
  );
  const { tight, long } = dropConflicts(rawTight, rawLong);

  // Every LONG muscle across every active/stacked pattern (including
  // core-stability-only slots like TVA) — a Release/Mobility candidate
  // must never stretch any of these, even if it also legitimately
  // targets a TIGHT-muscle slot. See pickForSlots' docblock.
  const allLongLabels = new Set(
    patterns.flatMap((p) => CORRECTIVE_BLUEPRINTS[p.blueprint].longMuscles.flatMap((s) => s.canonicalLabels))
  );

  const patternSummary = patterns.map((p) => CORRECTIVE_BLUEPRINTS[p.blueprint].name).join(' + ');

  const blocks: SessionBlockDraft[] = [];

  blocks.push({
    block: 'release',
    name: 'Release',
    blockReasoning: `Myofascial release for this member's tight muscles (${patternSummary}) — always first, never touches the long/weak side of the pattern.`,
    exercises: pickForSlots(
      pool,
      tight,
      ['release'],
      'musclesStretched',
      budget.release,
      usedIds,
      rng,
      (e, slot) => `Foam-roll/self-release for ${slot.muscle} (tight in ${slot.blueprintNames.join(' + ')}).`,
      allLongLabels
    ),
  });

  blocks.push({
    block: 'mobility',
    name: 'Mobility',
    blockReasoning: `Stretch and active mobility work for the ranges this pattern restricts (${patternSummary}).`,
    exercises: pickForSlots(
      pool,
      tight,
      ['stretch', 'mobility'],
      'musclesStretched',
      budget.mobility,
      usedIds,
      rng,
      (e, slot) => `Mobility/stretch work for ${slot.muscle} (tight in ${slot.blueprintNames.join(' + ')}).`,
      allLongLabels
    ),
  });

  blocks.push({
    block: 'stability',
    name: 'Stability',
    blockReasoning: `The main corrective work — strengthening this pattern's long, underactive muscles with a stability emphasis (${patternSummary}).`,
    exercises: pickForSlots(pool, long, ['stability', 'strength'], 'musclesStrengthened', budget.stability, usedIds, rng, (e, slot) =>
      `Stability/strengthening work for ${slot.muscle} (long/underactive in ${slot.blueprintNames.join(' + ')}).`
    ),
  });

  if (budget.strength > 0) {
    blocks.push({
      block: 'strength',
      name: 'Strength',
      blockReasoning: 'Full-body compound strength work, lower-body-led into upper body and a lower-strain accessory finisher.',
      exercises: pickStrengthBlock(pool, budget.strength, usedIds, rng),
    });
  }

  blocks.push({
    block: 'core',
    name: 'Core',
    blockReasoning: 'Core-stability (anti-movement) work only — always the final block, never spinal-flexion.',
    exercises: pickCoreBlock(pool, patterns, budget.core, usedIds, rng),
  });

  return { label, blocks };
}
