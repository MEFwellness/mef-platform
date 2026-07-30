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

/** Which media source is actually behind an exercise's video, if any — drives whether playback fetches a fresh URL from Your Move at tap time or uses ExerciseAPI.dev's own (non-expiring) URL directly. */
export type ExerciseVideoSource = 'your_move' | 'exercise_api_dev';

/**
 * A row in your_move_exercise_links (migration 118) — the our-id -> Your
 * Move-id mapping. video_url/video_url_expires_at are a short-lived
 * fetch-at-play-time cache, never long-term storage of the vendor's
 * pre-signed URL (see Your Move's 48h expiry terms) — a null or expired
 * value means "fetch fresh from Your Move," the normal, expected state.
 */
export interface YourMoveExerciseLink {
  id: string;
  provider: ExerciseLibraryProvider;
  external_id: string;
  your_move_exercise_id: string;
  match_confidence: 'confident';
  match_reasoning: string | null;
  video_url: string | null;
  video_url_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A row in exercise_extracted_posters (migration 118) — a mid-movement frame extracted from either source's video and stored in our own Supabase storage. Only source='your_move' rows belong in the purge manifest. */
export interface ExerciseExtractedPoster {
  id: string;
  provider: ExerciseLibraryProvider;
  external_id: string;
  source: ExerciseVideoSource;
  storage_path: string;
  created_at: string;
}

/** A row in exercise_open_license_images (migration 118) — also the license manifest: every open-license image this app stores must have a provable commercial-use license recorded here. */
export interface ExerciseOpenLicenseImage {
  id: string;
  provider: ExerciseLibraryProvider;
  external_id: string;
  storage_path: string;
  source_url: string;
  source_provider: 'wikimedia_commons' | 'pexels' | 'unsplash' | 'other_open_license';
  license_type: string;
  attribution: string | null;
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
 *
 * Media fields, in the order a card/detail view checks them:
 *   1. hasVideo/videoSource — true means tap-to-play is available.
 *      videoUrl itself is NEVER eagerly populated for a your_move source
 *      (fetched fresh at play time, per Your Move's 48h URL-expiry terms);
 *      it IS eagerly populated for exercise_api_dev (that vendor's URLs
 *      don't expire). posterUrl is the cover image shown behind the play
 *      button either way — an extracted mid-movement frame we store
 *      ourselves, never the vendor's own thumbnail/still.
 *   2. imageUrl — a Phase 3 open-license image, only set when there is no
 *      video from either source.
 *   3. cues — Phase 4 short coaching cues, only set when there is neither
 *      video nor image. An exercise with none of the three is the one
 *      state that must never occur once the media backfill is complete.
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
  hasVideo: boolean;
  videoSource: ExerciseVideoSource | null;
  posterUrl: string | null;
  imageUrl: string | null;
  cues: string[];
  metadata: MefExerciseMetadata | null;
  isFavorited: boolean;
}
