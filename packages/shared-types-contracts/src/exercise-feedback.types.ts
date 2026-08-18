/**
 * The member's voice inside her own program (migration 177).
 *
 * Three things a member can now do that she could not before: say what she
 * lifted, say how an exercise felt, and be offered a different one inside
 * the rules her coach set. The weight lives on the frozen exercise row
 * itself (see CoachAssignedWorkoutExercise); the other two are the two
 * tables typed here.
 */

/** Why she is asking for something different. The exact list her sheet offers, in the order it offers them. */
export type ExerciseFeedbackReason =
  | 'pain'
  | 'too_difficult'
  | 'too_easy'
  | 'do_not_understand'
  | 'no_equipment'
  | 'no_space'
  | 'not_comfortable'
  | 'do_not_like'
  | 'other';

/**
 * Which set of rules a report is judged under. Recorded on the row rather
 * than re-derived at read time, because the rules may get better and what
 * actually happened to her has to stay true.
 *
 *   safety            pain or discomfort. No replacement is offered at
 *                     all, the exercise is stopped, her coach is flagged.
 *   regression        too difficult. Only genuinely easier options, never
 *                     a lateral move and never a harder one.
 *   progression_note  too easy. Nothing is offered. Load and progression
 *                     are her coach's decision, not an app's.
 *   alternatives      every practical or preference reason. Two or three
 *                     options that do the same job in the same block.
 */
export type ExerciseFeedbackBranch =
  | 'safety'
  | 'regression'
  | 'progression_note'
  | 'alternatives';

/** What the app actually did about it. */
export type ExerciseFeedbackOutcome =
  | 'stopped_for_pain'
  | 'swapped'
  | 'kept_original'
  | 'logged_for_coach'
  | 'no_options';

/** Why an exercise is on her do-not-offer list. */
export type ExerciseAvoidanceSource =
  | 'pain'
  | 'repeated_dislike'
  | 'repeated_skip'
  | 'swapped_away';

export interface MemberExerciseFeedback {
  id: string;
  member_id: string;
  coach_id: string | null;

  assigned_workout_exercise_id: string | null;
  assigned_workout_id: string | null;
  assignment_id: string | null;
  program_group_key: string | null;
  program_week: number | null;

  provider: string;
  external_id: string;
  exercise_name: string;

  reason: ExerciseFeedbackReason;
  /** Her own words, only ever from the "Other" box. Never composed into anything and never shown back to her. */
  other_text: string | null;

  branch: ExerciseFeedbackBranch;
  outcome: ExerciseFeedbackOutcome;

  replacement_provider: string | null;
  replacement_external_id: string | null;
  replacement_exercise_name: string | null;
  occurrences_updated: number;

  initiated_by: 'member' | 'coach';
  coach_notified: boolean;
  coach_reviewed_at: string | null;

  created_at: string;
}

export interface MemberExerciseAvoidance {
  id: string;
  member_id: string;
  provider: string;
  external_id: string;
  exercise_name: string;
  source: ExerciseAvoidanceSource;
  feedback_id: string | null;
  /** A coach letting an exercise back in. Released rather than deleted, so the history stays readable. */
  released_at: string | null;
  released_by: string | null;
  created_at: string;
}

/** One option the rules will let her pick, as her screen renders it. */
export interface ExerciseSwapOption {
  provider: string;
  externalId: string;
  name: string;
  /** What makes it different from the one she has, in her words. Never a rule name and never a difficulty grade. */
  note: string;
}

/** Everything her screen needs after she picks a reason: what to say to her, and what she may choose. */
export interface ExerciseFeedbackDecision {
  branch: ExerciseFeedbackBranch;
  /** The warm sentence she reads. Composed by rule, never stored free text. */
  message: string;
  /** At most three. Empty on every branch that offers nothing, which is not a failure. */
  options: ExerciseSwapOption[];
  /** True when the exercise was stopped for safety. */
  stopped: boolean;
  /** True when her coach was flagged about this. */
  coachNotified: boolean;
  /** The row this decision was recorded against, so a pick can be attached to it. */
  feedbackId: string | null;
}
