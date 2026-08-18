/**
 * An assigned workout, flattened into the shape the guided player walks.
 *
 * The player knows nothing about sections, blocks or statuses: it takes a
 * list of exercises with strings already formatted. This is the whole
 * translation, kept as a pure function so a test can assert what a member
 * would be walked through without rendering anything.
 *
 * ORDER IS THE COACH'S ORDER. Sections come back from the database already
 * ordered by sequence_index, and so do the exercises inside them, so a
 * corrective program is walked Release, then Mobility, then Stability,
 * then Strength, then Core, exactly as it is written. Nothing here sorts,
 * filters or hides an exercise: a member walking the session sees every
 * exercise her coach put in it, including ones she has already marked.
 */
import type { CoachAssignedWorkoutWithContent } from '@mef/shared-types-contracts';
import type { GuidedExercise } from '@/components/movement-sessions/GuidedSessionPlayer';
import type { AssignedExerciseMediaMap } from './assignedWorkoutMedia';
import {
  formatPrescriptionLine,
  formatPrescriptionSummary,
  formatRest,
} from './prescription';

/** One walked exercise, plus the row id the status writes need. */
export interface GuidedWorkoutExercise extends GuidedExercise {
  /** coach_assigned_workout_exercises.id — what a mark-done or a skip is recorded against. */
  exerciseRowId: string;
  /** The block this exercise sits in, e.g. "Release". Shown so the walk still reads as a structured session. */
  sectionName: string;
}

export function toGuidedWorkoutExercises(
  workout: CoachAssignedWorkoutWithContent,
  media: AssignedExerciseMediaMap
): GuidedWorkoutExercise[] {
  const exercises: GuidedWorkoutExercise[] = [];

  for (const section of workout.sections) {
    for (const exercise of section.exercises) {
      const assets = media[exercise.external_id];
      // The snapshot's own cues are what the coach approved, so they lead.
      // The catalog's generated cues are the fallback, and are also what
      // the video player shows if a video will not load.
      const snapshotCues = exercise.coaching_cues
        ? [exercise.coaching_cues]
        : [];
      exercises.push({
        key: exercise.id,
        exerciseRowId: exercise.id,
        sectionName: section.name,
        externalId: exercise.external_id,
        name: exercise.exercise_name,
        primaryMuscle: assets?.primaryMuscle ?? null,
        category: assets?.category ?? null,
        posterUrl: assets?.posterUrl ?? null,
        cues: snapshotCues.length > 0 ? snapshotCues : (assets?.cues ?? []),
        // Rest is excluded here and printed as its own sentence by the
        // player, so a member is never told the rest twice on one screen.
        prescription: formatPrescriptionLine(exercise, { includeRest: false }),
        prescriptionSummary: formatPrescriptionSummary(exercise),
        rest: formatRest(exercise),
      });
    }
  }

  return exercises;
}
