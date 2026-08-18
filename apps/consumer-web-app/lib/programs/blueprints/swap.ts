/**
 * What a blueprint slot will accept in place of the exercise it holds.
 *
 * A named program is authored. When a coach swaps something out of it
 * before assigning, the replacement is not a free choice: the slot exists
 * to do a job, and a slot that accepts anything is not a slot, it is a gap.
 *
 * THE RULES, in the order they are checked:
 *
 *   1. A LOCKED slot is not swappable. The locked slots are the ones that
 *      make the program the program: the main lift, the movement the
 *      week is built around. Changing one produces a different program,
 *      and the way to get a different program is to author one.
 *
 *   2. The replacement must be CLIENT ASSIGNABLE. Migration 170's one
 *      rule, unchanged: a member may only be given an exercise she can be
 *      shown how to do. This is the rule a coach override does not get to
 *      bypass either.
 *
 *   3. The replacement must satisfy the slot's own REPLACEMENT CRITERIA.
 *      Every field is optional and every one of them narrows. An empty
 *      criteria object, which is what every slot seeded so far carries,
 *      still means "same block", because the block is where the slot sits
 *      in the session and moving it would reorder the session.
 *
 * Pure functions with no Supabase import, so the rules can be read and
 * tested without a database, and so the screen and the server check the
 * same thing rather than two things that resemble each other.
 */
import type {
  BlueprintBlock,
  BlueprintReplacementCriteria,
  ProgramBlueprintSlot,
  ProgramDifficulty,
} from '@mef/shared-types-contracts';

/** The little a candidate has to tell us about itself to be judged. */
export interface SwapCandidate {
  provider: string;
  externalId: string;
  name: string;
  isClientAssignable: boolean;
  block?: BlueprintBlock | null;
  movementPattern?: string | null;
  equipment?: string | null;
  difficulty?: ProgramDifficulty | null;
}

const DIFFICULTY_ORDER: Record<ProgramDifficulty, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

/**
 * The slot's criteria, read defensively. `replacement_criteria` is a jsonb
 * column, so it can hold anything; anything it holds that is not one of
 * these fields, in the shape these fields expect, is ignored rather than
 * trusted.
 */
export function readReplacementCriteria(
  slot: Pick<ProgramBlueprintSlot, 'replacement_criteria'>
): BlueprintReplacementCriteria {
  const raw = slot.replacement_criteria;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const criteria: BlueprintReplacementCriteria = {};

  if (typeof source.block === 'string') {
    criteria.block = source.block as BlueprintBlock;
  }
  if (typeof source.movement_pattern === 'string') {
    criteria.movement_pattern = source.movement_pattern;
  }
  if (Array.isArray(source.equipment)) {
    criteria.equipment = source.equipment.filter((e): e is string => typeof e === 'string');
  }
  if (
    typeof source.max_difficulty === 'string' &&
    source.max_difficulty in DIFFICULTY_ORDER
  ) {
    criteria.max_difficulty = source.max_difficulty as ProgramDifficulty;
  }
  if (Array.isArray(source.exclude_external_ids)) {
    criteria.exclude_external_ids = source.exclude_external_ids.filter(
      (e): e is string => typeof e === 'string'
    );
  }

  return criteria;
}

/** Why this candidate cannot go in this slot, or null when it can. One sentence, in the words a coach would use. */
export function slotSwapBlockedReason(
  slot: ProgramBlueprintSlot,
  candidate: SwapCandidate
): string | null {
  if (slot.is_locked) {
    return 'This slot is locked. It is the movement the program is built around, so it cannot be swapped out.';
  }

  if (!candidate.isClientAssignable) {
    return `${candidate.name} has no video yet, so it cannot be given to a member.`;
  }

  const criteria = readReplacementCriteria(slot);

  const requiredBlock = criteria.block ?? slot.block;
  if (candidate.block && candidate.block !== requiredBlock) {
    return `This slot is part of the ${requiredBlock} block, and ${candidate.name} does not belong to it.`;
  }

  if (criteria.movement_pattern && candidate.movementPattern !== criteria.movement_pattern) {
    return `This slot needs a ${criteria.movement_pattern.replace(/_/g, ' ')} movement.`;
  }

  const allowedEquipment =
    criteria.equipment ??
    (slot.equipment_requirement.length > 0 ? slot.equipment_requirement : null);
  if (allowedEquipment && allowedEquipment.length > 0) {
    const equipment = candidate.equipment ?? null;
    // Bodyweight always clears an equipment requirement: needing a
    // dumbbell is a floor, not a ceiling, and a coach dropping to
    // bodyweight is making the slot easier, never impossible.
    const isBodyweight = equipment === null || equipment === 'bodyweight';
    if (!isBodyweight && !allowedEquipment.includes(equipment)) {
      return `This slot is written for ${allowedEquipment.join(' or ')}, and ${candidate.name} needs ${equipment}.`;
    }
  }

  if (criteria.max_difficulty && candidate.difficulty) {
    if (DIFFICULTY_ORDER[candidate.difficulty] > DIFFICULTY_ORDER[criteria.max_difficulty]) {
      return `This slot goes no harder than ${criteria.max_difficulty}, and ${candidate.name} is ${candidate.difficulty}.`;
    }
  }

  if (criteria.exclude_external_ids?.includes(candidate.externalId)) {
    return `${candidate.name} is specifically excluded from this slot.`;
  }

  return null;
}

/** Convenience: the candidates a slot would accept, in the order they were given. */
export function candidatesForSlot<T extends SwapCandidate>(
  slot: ProgramBlueprintSlot,
  candidates: T[]
): T[] {
  return candidates.filter((candidate) => slotSwapBlockedReason(slot, candidate) === null);
}

/** A plain-English description of what this slot will take, for the picker's header. */
export function describeSlotCriteria(slot: ProgramBlueprintSlot): string {
  if (slot.is_locked) return 'Locked slot. This one does not change.';

  const criteria = readReplacementCriteria(slot);
  const parts: string[] = [`${criteria.block ?? slot.block} block`];

  if (criteria.movement_pattern) {
    parts.push(`${criteria.movement_pattern.replace(/_/g, ' ')} pattern`);
  }
  const equipment =
    criteria.equipment ??
    (slot.equipment_requirement.length > 0 ? slot.equipment_requirement : null);
  if (equipment && equipment.length > 0) parts.push(equipment.join(' or '));
  if (criteria.max_difficulty) parts.push(`${criteria.max_difficulty} or easier`);

  return `Takes any ${parts.join(', ')} exercise with a video.`;
}
