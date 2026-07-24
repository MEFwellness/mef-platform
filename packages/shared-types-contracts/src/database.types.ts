// Hand-authored, friendly domain types (not the raw `supabase gen types`
// output) so every consumer (consumer-web-app today; knowledge-engine-api
// and pattern-prioritization-engine once they exist) shares one source of
// truth and a schema drift shows up as a compile error, not a runtime bug.
// Must be kept in sync with supabase/migrations by hand — there is no
// generation step wired up yet. When adding a column, update the matching
// interface here in the same change as the migration.

export type Role =
  | 'member'
  | 'coach'
  | 'clinician_reviewer'
  | 'corporate_administrator'
  | 'organization_administrator'
  | 'api_client'
  | 'platform_administrator';

export type AnswerType = 'numeric' | 'enum' | 'multi_select' | 'boolean' | 'free_text';
export type AnswerStatus = 'answered' | 'not_sure' | 'not_applicable' | 'prefer_not_to_answer';
export type ConsentType =
  'terms_of_use' | 'privacy_policy' | 'wellness_education_disclaimer' | 'ai_assisted_processing';

export interface Profile {
  id: string;
  organization_id: string | null;
  display_name: string | null;
  timezone: string;
  created_at: string;
  deleted_at: string | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: Role;
  organization_id: string | null;
  granted_at: string;
  granted_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
}

export interface ConsentRecord {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  version: string;
  granted_at: string | null;
  revoked_at: string | null;
}

export interface CoachClientAssignment {
  id: string;
  coach_id: string;
  client_id: string;
  assigned_by: string;
  status: 'active' | 'revoked' | 'completed';
  start_date: string;
  end_date: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  created_at: string;
}

export type OnboardingQuestionPool = 'legacy' | 'concern_bank' | 'shared_pool';

export interface OnboardingQuestion {
  id: string;
  question_key: string;
  assessment_version_id: string;
  question_version: number;
  display_order: number;
  prompt_text: string;
  /** Optional short line shown under the prompt in the live flow. Null for the legacy 12 (their helper copy, where any exists, lives in coachCopy.ts's COACH_HELPER instead). */
  helper_text: string | null;
  answer_type: AnswerType;
  allowed_values: unknown | null;
  domain: string;
  allows_not_sure: boolean;
  allows_not_applicable: boolean;
  allows_prefer_not_to_answer: boolean;
  /** Which bank this question belongs to — 'legacy' is the original fixed 12, always fetched alone for reassessments. See lib/adaptive-assessment-engine and lib/onboarding/adaptivePlan.ts. */
  question_pool: OnboardingQuestionPool;
  /** Set only for question_pool = 'concern_bank' — which primary_concern value this question's bank belongs to. */
  concern: string | null;
  /** Base selection score for the adaptive engine. Legacy rows default to 1 (irrelevant — they're never adaptively selected). */
  weight: number;
  /** Eligibility gate: [{question_key, op, value}], ALL must hold against already-collected answers. Null/empty = always eligible. */
  requires: unknown | null;
  /** Additive personalization: [{question_key, op, value, amount}]. Null/empty = no boosts. */
  boosts: unknown | null;
}

export interface OnboardingAnswerInput {
  question_key: string;
  question_version: number;
  answer_status: AnswerStatus;
  value?: string | number | boolean | string[];
}

export interface OnboardingSubmission {
  id: string;
  user_id: string;
  assessment_version_id: string;
  submitted_at: string;
  timezone: string;
  local_date: string;
  raw_payload: unknown;
  // Reserved for future reassessments: a later submission would supersede
  // an earlier "current" one by setting this, without ever deleting the
  // row. Unused by submit_onboarding() today — every submission is kept.
  superseded_at: string | null;
  // 'baseline' = the member's first-ever submission, permanent. Computed
  // server-side by submit_onboarding() (migration 25), never client-set.
  assessment_type: 'baseline' | 'reassessment';
  // Reserved for a future scheduled-reminder system. Always null today.
  checkpoint_label: '30_day' | '90_day' | null;
}

export interface OnboardingAnswerRecord {
  id: string;
  submission_id: string;
  question_id: string;
  answer_status: AnswerStatus;
  value_numeric: number | null;
  value_enum: string | null;
  value_multi_select: string[] | null;
  value_boolean: boolean | null;
  value_free_text: string | null;
}

export type BowelMovementStatus = 'normal' | 'constipated' | 'loose' | 'none';

export interface DailyCheckinInput {
  timezone: string;
  local_date: string; // YYYY-MM-DD
  mood_level: number | null;
  sleep_quality: number | null;
  sleep_duration: '<5h' | '5-6h' | '6-7h' | '7-8h' | '8h+' | null;
  energy_level: number | null;
  stress_level: number | null;
  water_cups: number | null;
  digestion_rating: number | null;
  pain_discomfort_level: number | null;
  movement_today: 'none' | 'light' | 'moderate' | 'full_session' | null;
  new_or_worsening_concern: boolean;
  optional_notes: string | null;
  // Morning Readiness fields (migration 63) — all nullable/optional so the
  // morning check-in stands on its own without requiring every field.
  actual_bedtime: string | null; // HH:MM (24h), the time the member went to bed
  actual_wake_time: string | null; // HH:MM (24h)
  night_waking_count: number | null;
  night_sweats: boolean | null;
  morning_soreness: number | null; // 1-5
  bowel_movement_status: BowelMovementStatus | null;
}

export interface DailyCheckin extends DailyCheckinInput {
  id: string;
  user_id: string;
  recorded_at: string;
  checkin_version: number;
  edited_at: string | null;
  sleep_observation_period_start: string | null;
  sleep_observation_period_end: string | null;
  created_at: string;
}

export interface Habit {
  id: string;
  user_id: string;
  title: string;
  domain: string;
  target_frequency: 'daily' | '3x_week' | '5x_week';
  active: boolean;
  assigned_by: string | null;
  assigned_at: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  checkin_id: string | null;
  user_id: string;
  recorded_at: string;
  timezone: string;
  local_date: string;
  completed: boolean;
}

export interface CoachNote {
  id: string;
  coach_id: string;
  client_id: string;
  note: string;
  created_at: string;
  // Optional link to a specific onboarding_submission (baseline or
  // reassessment) this note is about. Null for general client notes.
  onboarding_submission_id: string | null;
}

// Unified Adaptive Assessment Foundation (migration 98). Named
// UnifiedAssessment* to avoid colliding with the two other, unrelated
// `AssessmentDefinition` types already in the app
// (lib/assessments/engine/types.ts and lib/assessment-registry/types.ts).
// Empty/unused by every existing questionnaire — see
// lib/assessment-foundation/ for the read layer built on these tables.

export interface UnifiedAssessmentDefinition {
  id: string;
  key: string;
  /** Optional bridge to assessment_definitions.id (migration 70's catalog row), once/if this assessment registers there too. */
  catalog_definition_id: string | null;
  title: string;
  description: string | null;
  assessment_type: string | null;
  estimated_completion_time_minutes: number | null;
  adaptive_enabled: boolean;
  reassessment_enabled: boolean;
  safety_enabled: boolean;
  scoring_profile: unknown | null;
  version: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnifiedAssessmentSection {
  id: string;
  assessment_definition_id: string;
  title: string;
  subtitle: string | null;
  display_order: number;
  adaptive_rules: unknown | null;
  completion_rules: unknown | null;
  optional: boolean;
  required: boolean;
  safety_category: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnifiedAssessmentQuestion {
  id: string;
  question_key: string;
  assessment_definition_id: string;
  section_id: string | null;
  version: number;
  active: boolean;
  display_order: number;
  prompt: string;
  description: string | null;
  answer_type: string;
  answer_options: unknown | null;
  validation: unknown | null;
  tags: string[] | null;
  body_system: string | null;
  body_region: string | null;
  concern_category: string | null;
  educational_tags: string[] | null;
  coach_tags: string[] | null;
  related_systems: string[] | null;
  severity_tags: string[] | null;
  /** Base selection score — required by lib/adaptive-assessment-engine's AdaptiveQuestion contract. */
  weight: number;
  requires: unknown | null;
  excludes: unknown | null;
  boosts: unknown | null;
  priority: number | null;
  /** Reserved for a future section/flow navigator — not interpreted by the adaptive engine yet. */
  follow_up_rules: unknown | null;
  skip_rules: unknown | null;
  completion_rules: unknown | null;
  created_at: string;
  updated_at: string;
}

// Unified Adaptive Assessment Runtime (migration 99) — session/answer
// storage for the unified_assessment_* content schema. Mirrors
// AssessmentRecord/wellness_assessment_answers in shape and purpose; see
// lib/assessment-runtime/ for the pure logic and I/O layer built on these.

export type UnifiedAssessmentSessionStatus = 'in_progress' | 'completed';

export interface UnifiedAssessmentSessionRow {
  id: string;
  member_id: string;
  assessment_definition_id: string;
  assessment_version: number;
  status: UnifiedAssessmentSessionStatus;
  current_section_id: string | null;
  current_question_id: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnifiedAssessmentAnswerRow {
  id: string;
  session_id: string;
  question_id: string;
  value: unknown;
  answered_at: string;
}
