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

export interface OnboardingQuestion {
  id: string;
  question_key: string;
  assessment_version_id: string;
  question_version: number;
  display_order: number;
  prompt_text: string;
  answer_type: AnswerType;
  allowed_values: unknown | null;
  domain: string;
  allows_not_sure: boolean;
  allows_not_applicable: boolean;
  allows_prefer_not_to_answer: boolean;
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
