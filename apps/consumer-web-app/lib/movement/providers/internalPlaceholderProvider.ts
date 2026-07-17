/**
 * The only configured MovementExerciseProvider today — reads from the
 * hardcoded placeholder catalog (lib/movement/exercises/catalog.ts).
 * Equipment filtering treats an exercise as available whenever every
 * equipment tag it lists (other than 'none') is present in the caller's
 * available-equipment set; an exercise tagged 'none' is always available.
 */

import type { MovementExercise } from '@mef/shared-types-contracts';
import { MOVEMENT_EXERCISE_CATALOG } from '../exercises/catalog';
import type { MovementExerciseFilter, MovementExerciseProvider } from './types';

function satisfiesEquipment(exercise: MovementExercise, available: string[] | undefined): boolean {
  if (!available) return exercise.equipment.every((e) => e === 'none');
  return exercise.equipment.every((e) => e === 'none' || available.includes(e));
}

function passesFilter(exercise: MovementExercise, filter: MovementExerciseFilter): boolean {
  if (filter.category && exercise.category !== filter.category) return false;
  if (filter.movementPattern && exercise.movement_pattern !== filter.movementPattern) return false;
  if (filter.difficulty && exercise.difficulty !== filter.difficulty) return false;
  if (!satisfiesEquipment(exercise, filter.availableEquipment)) return false;
  if (
    filter.excludeContraindications &&
    exercise.contraindications.some((c) => filter.excludeContraindications!.includes(c))
  ) {
    return false;
  }
  if (filter.excludeExerciseIds?.includes(exercise.exercise_id)) return false;
  return true;
}

export class InternalPlaceholderProvider implements MovementExerciseProvider {
  readonly name = 'internal_placeholder';

  async listExercises(filter: MovementExerciseFilter): Promise<MovementExercise[]> {
    return MOVEMENT_EXERCISE_CATALOG.filter((exercise) => passesFilter(exercise, filter));
  }

  async getExercise(exerciseId: string): Promise<MovementExercise | null> {
    return MOVEMENT_EXERCISE_CATALOG.find((e) => e.exercise_id === exerciseId) ?? null;
  }

  async getVariation(
    exerciseId: string,
    direction: 'easier' | 'harder'
  ): Promise<MovementExercise | null> {
    const exercise = await this.getExercise(exerciseId);
    if (!exercise) return null;
    const variationId =
      direction === 'easier' ? exercise.easier_variation_id : exercise.harder_variation_id;
    if (!variationId) return null;
    return this.getExercise(variationId);
  }
}
