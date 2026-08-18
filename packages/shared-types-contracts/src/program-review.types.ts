/**
 * The end-of-phase review (migration 178).
 *
 * One row per review a coach opens on one PROGRAM, which is two or three
 * assignments sharing a program_group_key. It carries the signals as they
 * read at that moment, what the rules recommended and why, what the coach
 * chose, and the unpublished draft the choice produced.
 *
 * Nothing typed here reaches a member. There is no member RLS policy on the
 * table and no member screen reads any of it.
 */

/** The six locked period-end decisions. Mirrors lib/programs/review/outcomes.ts and the table's own check constraint. */
export type ProgramReviewOutcome =
  | 'progress_next_phase'
  | 'rotate_exercises'
  | 'repeat_phase'
  | 'recovery_week'
  | 'different_program'
  | 'complete_and_archive';

/**
 * What the engine recommended: one of the six, or the deliberate refusal to
 * recommend anything while a pain report is waiting on a coach (migration
 * 181). It is NOT a seventh outcome. A coach cannot choose it, no draft is
 * built from it, and `chosen_outcome` below still allows exactly the six.
 */
export type ProgramRecommendedOutcome = ProgramReviewOutcome | 'coach_review_required';

export type ProgramReviewStatus = 'open' | 'drafted' | 'approved' | 'discarded';

export interface ProgramPhaseReview {
  id: string;
  member_id: string;
  coach_id: string;

  program_group_key: string;
  program_name: string;
  /** True when the coach opened this before the program had run its span. */
  opened_early: boolean;

  /** The signals as they read when the review was opened. Frozen, because a recommendation has to stay readable beside the numbers it was made from. */
  signal_snapshot: Record<string, unknown>;

  recommended_outcome: ProgramRecommendedOutcome;
  recommendation_reasoning: string;

  /** Null until the coach picks. Never defaulted to the recommendation. */
  chosen_outcome: ProgramReviewOutcome | null;
  chosen_at: string | null;

  draft_assignment_ids: string[];
  draft_template_ids: string[];
  draft_program_group_key: string | null;

  /** What the coach approved per exercise, keyed by external id. Recorded so "the coach edited the number" is a fact and not an inference. */
  approved_loads: Record<string, { load: number | null; unit: string | null }>;

  status: ProgramReviewStatus;
  coach_notes: string | null;

  created_at: string;
  updated_at: string;
}
