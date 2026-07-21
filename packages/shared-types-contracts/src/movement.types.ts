/**
 * Movement Intelligence — shared types for the movement_sessions and
 * movement_session_exercises tables (supabase/migrations/00000000000058_
 * movement_intelligence.sql). Same convention as every other *.types.ts
 * file here: hand-authored, kept in sync with the migration by hand, row/
 * type contracts only — decision logic lives in
 * apps/consumer-web-app/lib/movement/.
 *
 * IMPORTANT: exercises are only tools. MovementExercise is the STRUCTURE
 * any exercise source (an internal placeholder catalog today, Exercise.com/
 * Physitrack/custom video/a future API tomorrow) populates — see
 * lib/movement/providers/types.ts for the provider boundary itself, mirrors
 * lib/body-assessment/providers/types.ts on purpose. Nothing here is a real
 * content library; every field exists so a real one can slot in later
 * without changing a single line of the pages or the decision engine.
 */

/**
 * This is the one system-wide Program Section taxonomy — the single source
 * of truth for Programs, Templates, Root, Coach Builder, analytics, and
 * recommendations (see exercise-library.types.ts's
 * MefExerciseMetadata.program_section, and prescription-intelligence.types.ts's
 * PrescriptionBlockType, both of which read from this exact type). 'stability'
 * was added additively for the Exercise Library foundation
 * (supabase/migrations/00000000000080_exercise_library.sql), and 'power' was
 * added additively for the Prescription Intelligence Engine
 * (supabase/migrations/00000000000083_prescription_intelligence_engine.sql),
 * each alongside the pre-existing buckets rather than replacing them, so no
 * existing exercise, session, or rule keyed on an earlier value changes
 * meaning. No second, parallel block taxonomy may be introduced anywhere
 * in this codebase — extend this one instead.
 */
export type MovementSessionSection =
  | 'preparation'
  | 'breathing'
  | 'mobility'
  | 'activation'
  | 'stability'
  | 'strength'
  | 'power'
  | 'conditioning'
  | 'recovery';

export const MOVEMENT_SESSION_SECTION_ORDER: MovementSessionSection[] = [
  'preparation',
  'breathing',
  'mobility',
  'activation',
  'stability',
  'strength',
  'power',
  'conditioning',
  'recovery',
];

export const MOVEMENT_SESSION_SECTION_LABEL: Record<MovementSessionSection, string> = {
  preparation: 'Preparation',
  breathing: 'Breathing',
  mobility: 'Mobility',
  activation: 'Activation',
  stability: 'Stability',
  strength: 'Strength',
  power: 'Power',
  conditioning: 'Conditioning',
  recovery: 'Recovery',
};

/** Which system actually supplies an exercise's content — the field that makes an exercise library swappable. See lib/movement/providers/registry.ts. */
export type MovementExerciseSource =
  'internal_placeholder' | 'exercise_com' | 'physitrack' | 'custom_video' | 'api';

export type MovementDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type MovementEquipment =
  | 'none'
  | 'mat'
  | 'resistance_band'
  | 'light_dumbbells'
  | 'moderate_dumbbells'
  | 'kettlebell'
  | 'bench'
  | 'foam_roller'
  | 'stability_ball'
  | 'pull_up_bar'
  | 'other';

/**
 * The internal exercise data model. Every field a real exercise library
 * would need to describe one exercise — populated with placeholders only
 * today (lib/movement/exercises/catalog.ts). Nothing here assumes a
 * specific provider's shape; `source`/`external_ref` are the only fields
 * that vary by where the content actually comes from.
 */
export interface MovementExercise {
  exercise_id: string;
  source: MovementExerciseSource;
  /** The id this exercise has in its source system (Exercise.com's id, Physitrack's id, etc.) — null for internal_placeholder entries, which have no external system. */
  external_ref: string | null;
  title: string;
  category: MovementSessionSection;
  movement_pattern: string;
  equipment: MovementEquipment[];
  primary_muscles: string[];
  secondary_muscles: string[];
  difficulty: MovementDifficulty;
  contraindications: string[];
  coaching_cues: string[];
  common_mistakes: string[];
  default_sets: number | null;
  /** Free-form so it can express a rep range ("8-12") or a time-based hold ("30s") without two parallel fields. */
  default_reps: string | null;
  /** Eccentric-pause-concentric-pause seconds, e.g. "3-1-1-0". Null when tempo isn't prescribed for this exercise (most mobility/breathing work). */
  default_tempo: string | null;
  default_rest_seconds: number | null;
  estimated_duration_seconds: number;
  /** Placeholder only — no media is wired up yet. */
  video_url: string | null;
  /** Placeholder only — no media is wired up yet. */
  thumbnail_url: string | null;
  instructions: string[];
  easier_variation_id: string | null;
  harder_variation_id: string | null;
  notes: string | null;
}

export type MovementSessionStatus = 'ready' | 'in_progress' | 'completed' | 'skipped';

export type MovementRecoveryStatus = 'ready' | 'moderate' | 'limited' | 'rest' | 'unknown';

/**
 * One real input that shaped today's session — always traceable to an
 * actual fact (a check-in field, a registry finding, a wearable metric,
 * session history), never a canned line. See lib/movement/rules/facts.ts
 * and engine.ts, same "never fabricate a reason" discipline as
 * lib/ai/rules/engine.ts's renderTemplate.
 */
export interface MovementSelectionFactor {
  label: string;
  domain:
    | 'posture_finding'
    | 'pain'
    | 'stress'
    | 'sleep'
    | 'energy'
    | 'recovery'
    | 'wearable'
    | 'session_history'
    | 'goal'
    | 'equipment'
    | 'baseline';
  detail: string;
}

export interface MovementSession {
  id: string;
  member_id: string;
  local_date: string;
  timezone: string;
  status: MovementSessionStatus;
  focus_summary: string;
  recovery_status: MovementRecoveryStatus;
  estimated_duration_minutes: number;
  selection_reasons: MovementSelectionFactor[];
  /** 0-100, placeholder until richer signals (wearable recovery, ROM tracking) are wired in — null when there's not yet enough session history to compute one, never a fabricated number. */
  movement_score: number | null;
  generated_at: string;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  skip_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovementSessionExercise {
  id: string;
  session_id: string;
  member_id: string;
  exercise_id: string;
  section: MovementSessionSection;
  sequence_index: number;
  prescribed_sets: number | null;
  prescribed_reps: string | null;
  prescribed_tempo: string | null;
  prescribed_rest_seconds: number | null;
  estimated_duration_seconds: number;
  /** Why this exercise was picked over a sibling candidate — null when it was simply the section's default pick. */
  substitution_reason: string | null;
  completed: boolean;
  completed_at: string | null;
  member_notes: string | null;
  created_at: string;
}

/** The hydrated shape the UI actually renders — a session exercise joined with its full catalog record, resolved through whichever provider is configured. */
export interface MovementSessionExerciseWithDetail extends MovementSessionExercise {
  exercise: MovementExercise;
}

export interface MovementSessionWithExercises extends MovementSession {
  exercises: MovementSessionExerciseWithDetail[];
}

export interface MovementWeeklyGoal {
  targetSessionsPerWeek: number;
  completedThisWeek: number;
  weekStartLocalDate: string;
}
