/**
 * Which parts of the body a PROGRAM actually works.
 *
 * WHY THIS EXISTS. The explanation used to say "Your last posture check
 * pointed at your neck and upper back, so those get attention in every
 * session" whenever a neck finding existed, whether or not a single
 * exercise in the program went near her neck. On a hips-and-core program
 * that sentence is simply false, and the coach reading the first draft
 * said so. The sentence now needs two facts, not one: the finding's areas
 * AND the program's own, and it names only what they have in common.
 *
 * IT IS READ OFF THE PROGRAM'S OWN SLOTS, never off its name and never off
 * the finding that caused it to be generated. Two sources, one per kind of
 * program, both stored facts:
 *
 *   an authored program   every slot records a movement pattern
 *                         (program_blueprint_slots.movement_pattern, and
 *                         from migration 177 the template and frozen rows
 *                         carry it too). A squat works hips; an anti
 *                         extension hold works the deep core.
 *
 *   a generated program   a corrective program has no movement patterns,
 *                         because the engine picks by muscle. What it has
 *                         is its own blueprint: every block of it is built
 *                         from that pattern's tight and long muscle
 *                         slots, so the muscles it targets are known
 *                         exactly, from lib/corrective-engine/blueprints.ts
 *                         rather than from a second list written here.
 *
 * Where a program says neither, it contributes no areas, and the posture
 * sentence is dropped. Silence is the correct output of "this program does
 * not say what it works on".
 *
 * Pure. No Supabase import, no reads, no severity, no member.
 */
import type { BlueprintBlock } from '@mef/shared-types-contracts';
import { CORRECTIVE_BLUEPRINTS } from '../../corrective-engine/blueprints';
import type { BlueprintKey } from '../../corrective-engine/types';
import type { BodyAreaKey } from './bodyAreas';

/**
 * What a movement pattern works, in the same area keys a finding maps to.
 *
 * Conservative on purpose. A pattern is listed against an area only where
 * the area is what the movement is FOR, not everywhere the area is
 * involved: nearly every standing exercise involves the hips, and a map
 * that says so would put every area on every program and gate nothing.
 */
const PATTERN_AREAS: Record<string, BodyAreaKey[]> = {
  // Openers and mobility.
  spinal: ['lower_back', 'upper_back'],
  thoracic: ['upper_back'],
  shoulder: ['shoulders'],
  scapular: ['shoulders', 'upper_back'],
  hip_flexion: ['hips'],
  hip_rotation: ['hips'],

  // Lower body.
  squat: ['hips', 'knees'],
  lunge: ['hips', 'knees'],
  hip_hinge: ['hips', 'lower_back'],

  // Upper body.
  vertical_push: ['shoulders'],
  horizontal_push: ['shoulders'],
  vertical_pull: ['upper_back', 'shoulders'],
  horizontal_pull: ['upper_back', 'shoulders'],

  // Trunk.
  anti_extension: ['deep_core'],
  anti_rotation: ['deep_core'],
  anti_lateral_flexion: ['deep_core', 'trunk_sides'],
  anti_flexion: ['lower_back', 'hips'],
  rotation: ['deep_core', 'trunk_sides'],
  carry: ['deep_core', 'shoulders'],

  // Breathing work is its own thing and is never inferred from a lift.
  breathing: ['breathing'],
};

/**
 * What a muscle label belongs to, in area keys. The labels are the
 * corrective blueprints' own canonical labels, which is why this is keyed
 * by them rather than by anything invented here.
 */
const MUSCLE_AREAS: Record<string, BodyAreaKey[]> = {
  'hip flexors': ['hips'],
  quads: ['hips', 'knees'],
  adductors: ['hips'],
  tfl: ['hips'],
  'tensor fasciae latae': ['hips'],
  'lumbar erectors': ['lower_back'],
  glutes: ['hips'],
  hamstrings: ['hips'],
  'deep abdominals (tva)': ['deep_core'],
  abdominals: ['deep_core'],
  pecs: ['shoulders'],
  'upper traps': ['neck', 'shoulders'],
  lats: ['upper_back'],
  'levator scapulae': ['neck', 'shoulders'],
  'deep neck flexors': ['neck'],
  'lower traps': ['upper_back'],
  'mid traps': ['upper_back'],
  rhomboids: ['upper_back'],
  'serratus anterior': ['upper_back', 'shoulders'],
  suboccipitals: ['neck'],
  scm: ['neck'],
  scalenes: ['neck'],
  'thoracic extensors': ['upper_back'],
  calves: ['feet'],
  'tibialis anterior': ['feet'],
};

/** The block a slot sits in, where its pattern says nothing. Only the two blocks whose job IS an area. */
const BLOCK_AREAS: Partial<Record<BlueprintBlock, BodyAreaKey[]>> = {
  core: ['deep_core'],
};

export interface ProgramAreaSlot {
  block?: BlueprintBlock | null;
  /** The slot's own movement pattern. Null on anything the corrective engine generated. */
  movementPattern?: string | null;
}

function push(into: BodyAreaKey[], keys: readonly BodyAreaKey[] | undefined): void {
  for (const key of keys ?? []) {
    if (!into.includes(key)) into.push(key);
  }
}

/**
 * The areas an authored program's slots work. A slot with a pattern this
 * does not recognize contributes nothing rather than a guess.
 */
export function areasFromSlots(slots: readonly ProgramAreaSlot[]): BodyAreaKey[] {
  const areas: BodyAreaKey[] = [];
  for (const slot of slots) {
    const pattern = (slot.movementPattern ?? '').trim().toLowerCase();
    if (pattern && pattern in PATTERN_AREAS) {
      push(areas, PATTERN_AREAS[pattern]);
      continue;
    }
    if (slot.block) push(areas, BLOCK_AREAS[slot.block]);
  }
  return areas;
}

/**
 * The areas a generated program works, read from the corrective blueprints
 * it was generated against. Every block of such a program is built from
 * that pattern's own tight and long muscle slots, so this is the program's
 * actual content and not a label on it.
 */
export function areasFromCorrectiveTags(
  correctiveTags: readonly string[] | null | undefined
): BodyAreaKey[] {
  const areas: BodyAreaKey[] = [];
  for (const tag of correctiveTags ?? []) {
    const blueprint = CORRECTIVE_BLUEPRINTS[tag as BlueprintKey];
    if (!blueprint) continue;
    for (const slot of [...blueprint.tightMuscles, ...blueprint.longMuscles]) {
      for (const label of slot.canonicalLabels) {
        push(areas, MUSCLE_AREAS[label.trim().toLowerCase()]);
      }
    }
  }
  return areas;
}

/**
 * Everything the program works, from whichever of the two it can say. Both
 * are consulted rather than one or the other: a program can be generated
 * from a pattern AND carry slots a coach swapped in.
 */
export function programBodyAreaKeys(input: {
  slots?: readonly ProgramAreaSlot[] | null;
  correctiveTags?: readonly string[] | null;
}): BodyAreaKey[] {
  const areas: BodyAreaKey[] = [];
  push(areas, areasFromSlots(input.slots ?? []));
  push(areas, areasFromCorrectiveTags(input.correctiveTags));
  return areas;
}

/**
 * The areas her posture check pointed at THAT this program actually works,
 * in the order the findings came back.
 *
 * An empty result is the honest answer to "her check found something, and
 * this program does not go there", and it is what suppresses the sentence.
 */
export function sayableAreas(
  findingAreas: readonly BodyAreaKey[],
  programAreas: readonly BodyAreaKey[]
): BodyAreaKey[] {
  return findingAreas.filter((area) => programAreas.includes(area));
}
