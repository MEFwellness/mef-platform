/**
 * Root Movement, Level 1 (migration 153) — the six ready-made sessions.
 *
 * Deliberately separate from movement.types.ts. That file describes the
 * auto-generated daily Movement Intelligence session, which is composed
 * per member per day from their recovery state. These are fixed, global
 * templates that every member sees identically and chooses for herself.
 * Sharing a type between the two would imply a relationship neither
 * system has.
 */

export type MovementSessionPrescriptionType = 'time' | 'reps';

/** One of the six sessions, as stored. Editing a session is editing this row. */
export interface MovementSessionTemplate {
  id: string;
  session_key: string;
  name: string;
  /** One honest sentence, member-facing. */
  description: string;
  target_duration_min_minutes: number;
  target_duration_max_minutes: number;
  sort_order: number;
  is_active: boolean;
}

/** One exercise slot inside a session, in the order the member walks it. */
export interface MovementSessionTemplateSlot {
  id: string;
  slot_order: number;
  provider: 'your_move';
  external_id: string;
  prescription_type: MovementSessionPrescriptionType;
  prescription_seconds: number | null;
  prescription_reps: number | null;
  rest_seconds: number;
}

/**
 * A slot joined to the catalog fields the player actually renders. Only
 * the fields the existing exercise player needs, so a session screen
 * never loads more of the catalog than it shows.
 */
export interface MovementSessionSlotWithExercise extends MovementSessionTemplateSlot {
  name: string;
  primaryMuscle: string | null;
  category: string | null;
  posterUrl: string | null;
  /** Generated coaching cues, the fallback the player shows when a video will not load. */
  cues: string[];
}

/** A session and its resolved lineup, everything one session screen renders. */
export interface MovementSessionDetail {
  template: MovementSessionTemplate;
  slots: MovementSessionSlotWithExercise[];
  /** Sum of prescriptions and rests, in seconds. Derived, never stored. */
  estimatedSeconds: number;
}

/** A session in the list view: no lineup, just what a card shows. */
export interface MovementSessionSummary {
  template: MovementSessionTemplate;
  exerciseCount: number;
}

/**
 * One record of a member walking a session. Keys, ids, timestamps and
 * counts only: there is no note, no rating and no reason field on this
 * type because there is no such column, by design.
 *
 * completed_at null means she left part way through, which is an ordinary
 * state this product does not treat as a failure.
 */
export interface MemberMovementSessionRun {
  id: string;
  member_id: string;
  session_key: string;
  started_at: string;
  completed_at: string | null;
  /** Your Move external ids only. Never names, never reasons. */
  skipped_exercise_ids: string[];
}
