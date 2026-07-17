/**
 * Composes every decision in engine.ts into one concrete, not-yet-persisted
 * session plan. lib/movement/data.ts's generateTodaysSession() is the only
 * caller — it persists this draft into movement_sessions /
 * movement_session_exercises. Kept separate from that I/O so the actual
 * decision logic stays a pure function over facts + a provider, easy to
 * reason about and test independent of Supabase.
 */

import {
  MOVEMENT_SESSION_SECTION_ORDER,
  type MovementExercise,
  type MovementRecoveryStatus,
  type MovementSelectionFactor,
  type MovementSessionSection,
} from '@mef/shared-types-contracts';
import type { MovementExerciseProvider } from '../providers/types';
import type { MovementFacts } from './facts';
import {
  buildFocusSummary,
  buildSelectionReasons,
  decideExerciseCount,
  decideRecoveryStatus,
  decideSections,
  decideSessionLengthMinutes,
  selectDifficulty,
  selectExercisesForSection,
} from './engine';

export type MovementSessionPlanExercise = {
  section: MovementSessionSection;
  sequenceIndex: number;
  exercise: MovementExercise;
  prescribedSets: number | null;
  prescribedReps: string | null;
  prescribedTempo: string | null;
  prescribedRestSeconds: number | null;
  estimatedDurationSeconds: number;
};

export type MovementSessionPlan = {
  focusSummary: string;
  recoveryStatus: MovementRecoveryStatus;
  estimatedDurationMinutes: number;
  selectionReasons: MovementSelectionFactor[];
  exercises: MovementSessionPlanExercise[];
};

export async function generateMovementSessionPlan(
  facts: MovementFacts,
  provider: MovementExerciseProvider
): Promise<MovementSessionPlan> {
  const recoveryStatus = decideRecoveryStatus(facts);
  const includedSections = decideSections(recoveryStatus);
  const difficulty = selectDifficulty(facts, recoveryStatus);

  const exercises: MovementSessionPlanExercise[] = [];
  let sequenceIndex = 0;

  for (const section of MOVEMENT_SESSION_SECTION_ORDER) {
    if (!includedSections.includes(section)) continue;
    const count = decideExerciseCount(section, recoveryStatus);
    const picks = await selectExercisesForSection(section, count, facts, difficulty, provider);

    for (const exercise of picks) {
      exercises.push({
        section,
        sequenceIndex: sequenceIndex++,
        exercise,
        prescribedSets: exercise.default_sets,
        prescribedReps: exercise.default_reps,
        prescribedTempo: exercise.default_tempo,
        prescribedRestSeconds: exercise.default_rest_seconds,
        estimatedDurationSeconds: exercise.estimated_duration_seconds,
      });
    }
  }

  return {
    focusSummary: buildFocusSummary(includedSections),
    recoveryStatus,
    estimatedDurationMinutes: decideSessionLengthMinutes(recoveryStatus),
    selectionReasons: buildSelectionReasons(facts, recoveryStatus),
    exercises,
  };
}
