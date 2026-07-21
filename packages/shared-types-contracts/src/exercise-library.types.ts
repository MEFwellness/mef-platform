/**
 * Exercise Library — shared types for the tables added in
 * supabase/migrations/00000000000080_exercise_library.sql:
 * mef_exercise_metadata, member_exercise_favorites, movement_programs, and
 * movement_program_versions. Same convention as movement.types.ts /
 * food-lens-ecosystem.types.ts: hand-authored, row/type contracts only —
 * logic lives in apps/consumer-web-app/lib/exercise-library/.
 *
 * MefExerciseMetadata.program_section reuses MovementSessionSection
 * (movement.types.ts) rather than defining its own taxonomy — see that
 * file's header for why there is exactly one Program Section taxonomy in
 * this codebase, not two.
 */

import type { MovementSessionSection } from './movement.types';

/** Which content source an exercise or a piece of MEF metadata came from — the field that keeps the library swappable, same role as MovementExerciseSource (movement.types.ts). */
export type ExerciseLibraryProvider = 'exercise_api_dev';

export type MefExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * The MEF metadata layer that sits on top of an exercise content provider.
 * Every field is optional/empty by default — a row only exists for
 * exercises MEF has actually curated; an exercise with no row still works
 * in the library, just without MEF's own tagging layered on top.
 */
export interface MefExerciseMetadata {
  id: string;
  provider: ExerciseLibraryProvider;
  external_id: string;

  program_section: MovementSessionSection | null;
  movement_category: string | null;
  body_region: string[];
  equipment: string[];
  difficulty: MefExerciseDifficulty | null;

  corrective_focus: string[];
  mobility_focus: string[];
  strength_focus: string[];
  stability_focus: string[];

  contraindications: string[];
  coaching_cues: string[];

  regressions: string[];
  progressions: string[];

  goal_tags: string[];
  limitation_tags: string[];
  coach_notes: string | null;

  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberExerciseFavorite {
  id: string;
  member_id: string;
  provider: ExerciseLibraryProvider;
  external_id: string;
  created_at: string;
}

export type MovementProgramVersionStatus = 'draft' | 'published' | 'archived';

/** Program Version Foundation only — no Program Builder reads or writes these yet. */
export interface MovementProgram {
  id: string;
  key: string;
  display_name: string;
  created_at: string;
}

export interface MovementProgramVersion {
  id: string;
  program_id: string;
  version_number: number;
  display_name: string;
  status: MovementProgramVersionStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/**
 * The hydrated shape the Exercise Library UI actually renders — one
 * provider exercise, optionally joined with its MEF metadata row and the
 * signed-in member's favorite state. Nothing here assumes a specific
 * provider's wire shape beyond the normalized fields every provider must
 * supply; see apps/consumer-web-app/lib/exercise-library/normalize.ts.
 */
export interface ExerciseLibraryExercise {
  provider: ExerciseLibraryProvider;
  externalId: string;
  name: string;
  category: string | null;
  level: MefExerciseDifficulty | null;
  mechanic: 'compound' | 'isolation' | null;
  force: 'push' | 'pull' | 'static' | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  exerciseTips: string[];
  commonMistakes: string[];
  safetyInfo: string | null;
  overview: string | null;
  variations: string[];
  videoUrl: string | null;
  imageUrl: string | null;
  metadata: MefExerciseMetadata | null;
  isFavorited: boolean;
}
