/**
 * Member Exercise Experience + Movement Profile — shared types for
 * member_exercise_completions, member_exercise_recent_views,
 * member_movement_profiles, and movement_profile_review_items
 * (supabase/migrations/00000000000081_movement_profile_and_exercise_history.sql).
 * Same convention as every other *.types.ts file here: hand-authored, row/
 * type contracts only — logic lives in
 * apps/consumer-web-app/lib/exercise-library/ and
 * apps/consumer-web-app/lib/movement-profile/.
 *
 * See the migration's own header for why member_movement_profiles does NOT
 * store "completed exercises", "recent difficulty", or "exercise
 * frequency" as columns — that data is read live from
 * member_exercise_completions instead of being duplicated.
 */

import type { ExerciseLibraryProvider } from './exercise-library.types';
import type { HealthTimelineEvidenceRef } from './timeline.types';

export type ExerciseCompletionStatus = 'completed' | 'partial' | 'skipped';

export type ExerciseCompletionSource = 'exercise_library' | 'movement_session' | 'coach_assigned';

export type ExerciseDifficultyRating =
  'very_easy' | 'easy' | 'appropriate' | 'difficult' | 'very_difficult';

export type ExerciseComfortRating =
  'comfortable' | 'slight_discomfort' | 'moderate_discomfort' | 'pain';

export type ExerciseEnjoymentRating = 'liked' | 'neutral' | 'did_not_enjoy';

/** One immutable record of a member completing, partially completing, or skipping an exercise — never overwritten; every occurrence is its own row. */
export interface MemberExerciseCompletion {
  id: string;
  member_id: string;
  provider: ExerciseLibraryProvider;
  external_id: string;
  exercise_name: string;
  status: ExerciseCompletionStatus;
  duration_seconds: number | null;
  completion_source: ExerciseCompletionSource;
  member_notes: string | null;
  difficulty_rating: ExerciseDifficultyRating | null;
  comfort_rating: ExerciseComfortRating | null;
  enjoyment_rating: ExerciseEnjoymentRating | null;
  occurred_at: string;
  created_at: string;
}

/** A recency pointer, not history — one row per exercise a member has viewed, upserted on every view. */
export interface MemberExerciseRecentView {
  id: string;
  member_id: string;
  provider: ExerciseLibraryProvider;
  external_id: string;
  exercise_name: string;
  viewed_at: string;
}

/**
 * The permanent Movement Profile — one row per member. Field groups below
 * mirror the migration's two write-level RPCs exactly:
 * upsert_movement_profile_member_fields (automatic/member-controlled) and
 * upsert_movement_profile_coach_fields (coach-controlled). Nothing in this
 * codebase may write these columns any other way.
 */
export interface MemberMovementProfile {
  id: string;
  member_id: string;

  // Member-controlled
  goals: string[];
  equipment_access: string[];
  favorite_movement_types: string[];
  mobility_priorities: string[];
  stability_priorities: string[];
  strength_priorities: string[];
  assessment_references: HealthTimelineEvidenceRef[];
  program_history_references: HealthTimelineEvidenceRef[];

  // Coach-controlled
  movement_limitations: string[];
  exercise_restrictions: string[];
  contraindications: string[];
  medical_restrictions: string[];
  corrective_priorities: string[];
  /** Structure only — null until a coach sets it; never auto-scored. */
  capability_summary: Record<string, unknown> | null;
  exercise_clearance: string | null;
  assessment_interpretation: string | null;
  coach_observations: string | null;

  member_fields_updated_at: string | null;
  coach_fields_updated_at: string | null;
  coach_fields_updated_by: string | null;

  created_at: string;
  updated_at: string;
}

export type MovementProfileReviewType =
  | 'new_pain_report'
  | 'increased_discomfort'
  | 'repeated_inability'
  | 'possible_progression'
  | 'possible_regression'
  | 'capability_change'
  | 'new_movement_limitation'
  | 'restriction_conflict';

export type MovementProfileReviewStatus = 'pending' | 'acknowledged' | 'actioned' | 'dismissed';

/** Coach worklist item — never visible to the member it's about. See the migration header for why review items exist instead of a member write ever touching a coach-controlled field directly. */
export interface MovementProfileReviewItem {
  id: string;
  member_id: string;
  review_type: MovementProfileReviewType;
  summary: string;
  detail: string | null;
  source_feature: string;
  source_record_id: string | null;
  evidence_refs: HealthTimelineEvidenceRef[];
  proposed_changes: Record<string, unknown> | null;
  status: MovementProfileReviewStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
}
