/**
 * The provider boundary for Movement Intelligence — mirrors
 * lib/body-assessment/providers/types.ts exactly on purpose: the decision
 * engine (lib/movement/rules/), the session-generation action
 * (app/actions/movement.ts), and every Movement page must never import a
 * specific exercise library's SDK or shape directly, or swapping libraries
 * becomes a rewrite instead of a config change.
 *
 * Today's only real implementation (internalPlaceholderProvider.ts) reads
 * a small hardcoded placeholder catalog — no real content library is
 * integrated. This file exists so that whichever future integration
 * (Exercise.com, Physitrack, our own video library, a custom API) has a
 * contract to implement rather than inventing one under deadline.
 */

import type {
  MovementDifficulty,
  MovementEquipment,
  MovementExercise,
  MovementSessionSection,
} from '@mef/shared-types-contracts';

export type MovementExerciseFilter = {
  category?: MovementSessionSection;
  movementPattern?: string;
  /** The exercise's equipment list must be satisfiable using only this set (an empty/omitted filter means "assume bodyweight only," never "any equipment"). */
  availableEquipment?: MovementEquipment[];
  /** Contraindication tags to exclude — an exercise is filtered out if any of its `contraindications` intersects this list. */
  excludeContraindications?: string[];
  difficulty?: MovementDifficulty;
  /** Exercise ids to exclude — used for session-to-session variety and to avoid immediately repeating yesterday's picks. */
  excludeExerciseIds?: string[];
};

export interface MovementExerciseProvider {
  readonly name: string;
  listExercises(filter: MovementExerciseFilter): Promise<MovementExercise[]>;
  getExercise(exerciseId: string): Promise<MovementExercise | null>;
  /** Returns the requested variation of an exercise (its `easier_variation_id`/`harder_variation_id`), or null if that exercise has none. */
  getVariation(
    exerciseId: string,
    direction: 'easier' | 'harder'
  ): Promise<MovementExercise | null>;
}
