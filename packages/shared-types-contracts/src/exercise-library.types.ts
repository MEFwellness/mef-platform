/**
 * Exercise Library — shared types. Your Move (exercise-api.ymove.app) is
 * the sole exercise catalog (supabase/migrations/00000000000119_your_move_
 * sole_catalog.sql) — exercise_catalog, mef_exercise_metadata,
 * member_exercise_favorites, movement_programs, and movement_program_versions
 * (originally added in migration 80). Same convention as movement.types.ts /
 * food-lens-ecosystem.types.ts: hand-authored, row/type contracts only —
 * logic lives in apps/consumer-web-app/lib/exercise-library/ and lib/your-move/.
 *
 * MefExerciseMetadata.program_section reuses MovementSessionSection
 * (movement.types.ts) rather than defining its own taxonomy — see that
 * file's header for why there is exactly one Program Section taxonomy in
 * this codebase, not two.
 */

import type { MovementSessionSection } from './movement.types';

/**
 * Which content source an exercise or a piece of MEF metadata came from.
 * 'exercise_api_dev' survives solely as a legacy marker on pre-existing
 * member data (assigned workouts, favorites, completion/view history,
 * coach program and prescription rows) whose exercise no longer resolves
 * in the live catalog; see is_legacy on those row types below. Nothing in
 * this codebase ever calls out to ExerciseAPI.dev again.
 *
 * 'mef_custom' (migration 129) marks exercise_catalog/mef_exercise_metadata
 * rows MEF authored directly — cue-only corrective exercises with no Your
 * Move video, created to fill corrective-blueprint gaps (see
 * docs/CORRECTIVE_BLUEPRINT_GAP_CHECK.md). These are never Your Move's
 * proprietary content and must never be touched by the Your Move
 * subscription-lapse purge (scripts/exercise-media/purge-your-move-media.ts),
 * which scopes its exercise_catalog writes to `provider = 'your_move'`
 * specifically for this reason.
 */
export type ExerciseLibraryProvider = 'your_move' | 'exercise_api_dev' | 'mef_custom';

export type MefExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * Corrective-role metadata (migration 127) — see apps/consumer-web-app/lib/
 * exercise-library/correctiveClassification.ts for the rules that assign
 * these. Pure data foundation for a future AI corrective program
 * generator; nothing reads these yet.
 */
export type CorrectiveRole =
  | 'release'
  | 'stretch'
  | 'mobility'
  | 'stability'
  | 'strength'
  | 'power'
  | 'core_stability';

export type CorrectiveStrainLevel = 'low' | 'moderate' | 'high';

/**
 * A row in exercise_catalog (migration 119) — the sole Exercise Library
 * catalog, populated from Your Move's browse endpoint (quota-free) by
 * scripts/exercise-media/fetch-your-move-catalog.ts. video_url/
 * video_url_expires_at are a short-lived (~10min) fetch-at-play-time
 * cache, never long-term storage of Your Move's 48h pre-signed URL — a
 * null or expired value means "fetch fresh from Your Move," the normal,
 * expected state.
 */
export interface ExerciseCatalogRow {
  id: string;
  provider: 'your_move' | 'mef_custom';
  external_id: string;

  name: string;
  slug: string | null;
  description: string | null;
  instructions: string[];
  exercise_tips: string[];

  primary_muscle: string | null;
  secondary_muscles: string[];
  equipment: string | null;
  category: string | null;
  difficulty: MefExerciseDifficulty | null;
  exercise_type: string[];

  has_video: boolean;
  has_video_white: boolean;
  has_video_gym: boolean;

  video_url: string | null;
  video_url_expires_at: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * The MEF metadata layer that sits on top of the exercise_catalog. Every
 * field is optional/empty by default — a row only exists for exercises MEF
 * has actually curated, or for which coaching_cues have been generated
 * (Phase 4, see cueGeneration.ts) as a video-fallback layer; an exercise
 * with no row still works in the library, just without MEF's own tagging
 * layered on top.
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

  corrective_roles: CorrectiveRole[];
  muscles_stretched: string[];
  muscles_strengthened: string[];
  strain_level: CorrectiveStrainLevel | null;
  spinal_flexion_core: boolean;

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
  /** True when this favorite has no confident Your Move match — the exercise no longer resolves in exercise_catalog, so legacy_exercise_name is the only remaining display source. */
  is_legacy: boolean;
  legacy_exercise_name: string | null;
  created_at: string;
}

/** A row in exercise_extracted_posters (migration 118) — a mid-movement frame extracted from a Your Move video and stored in our own Supabase storage. Tracked here so it can be purged if the Your Move subscription ever lapses. */
export interface ExerciseExtractedPoster {
  id: string;
  provider: 'your_move';
  external_id: string;
  source: 'your_move';
  storage_path: string;
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
 * exercise_catalog row, optionally joined with its MEF metadata row and
 * the signed-in member's favorite state.
 *
 * Media fields, in the order a card/detail view checks them:
 *   1. hasVideo — true means tap-to-play is available. videoUrl is NEVER
 *      eagerly populated (fetched fresh at play time, per Your Move's 48h
 *      URL-expiry terms). posterUrl is the cover image shown behind the
 *      play button — an extracted mid-movement frame we store ourselves.
 *   2. cues — short coaching cues generated from Your Move's own
 *      instructions, shown whenever there is no video, AND as the graceful
 *      fallback if a video tap-to-play fetch fails (e.g. the trial API key
 *      not covering every exercise) — never a broken player.
 */
export interface ExerciseLibraryExercise {
  provider: 'your_move' | 'mef_custom';
  externalId: string;
  name: string;
  category: string | null;
  level: MefExerciseDifficulty | null;
  equipment: string | null;
  primaryMuscle: string | null;
  secondaryMuscles: string[];
  instructions: string[];
  exerciseTips: string[];
  hasVideo: boolean;
  posterUrl: string | null;
  cues: string[];
  metadata: MefExerciseMetadata | null;
  isFavorited: boolean;
}
