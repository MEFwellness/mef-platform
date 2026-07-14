/**
 * MEF Wellness Intelligence Core (Milestone 9) — shared types for
 * wellness_identity_observations, wellness_profile_dimensions,
 * wellness_coaching_style_profile, and wellness_recommendation_feedback
 * (supabase/migrations/00000000000036_intelligence_core.sql). Same
 * convention as every other *.types.ts file here: hand-authored, kept in
 * sync with the migration by hand, row/type contracts only — derivation
 * logic lives in apps/consumer-web-app/lib/intelligence-core/.
 */

export type WellnessIdentityDomain =
  | 'motivation_style'
  | 'coaching_preference'
  | 'habit_adherence'
  | 'task_load_tolerance'
  | 'time_commitment'
  | 'movement_response'
  | 'pain_correlation'
  | 'sleep_correlation'
  | 'stress_correlation'
  | 'emotional_language'
  | 'confidence_calibration'
  | 'engagement_rhythm';

export type WellnessIdentityTrendDirection = 'strengthening' | 'weakening' | 'stable';

export type WellnessIdentityStatus = 'active' | 'resolved' | 'superseded';

export interface WellnessIdentityEvidenceRef {
  type: string;
  id: string;
  note?: string;
}

export interface WellnessIdentityObservation {
  id: string;
  member_id: string;
  domain: WellnessIdentityDomain;
  observation_key: string;
  statement: string;
  coach_detail: string;
  confidence: number;
  evidence_count: number;
  trend_direction: WellnessIdentityTrendDirection;
  status: WellnessIdentityStatus;
  evidence_refs: WellnessIdentityEvidenceRef[];
  member_visible: boolean;
  coach_context: string | null;
  coach_reviewed_by: string | null;
  coach_reviewed_at: string | null;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  first_observed_at: string;
  last_observed_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type WellnessProfileDimensionKey =
  | 'recovery_capacity'
  | 'movement_confidence'
  | 'stress_resilience'
  | 'lifestyle_consistency'
  | 'motivation_profile'
  | 'coaching_style_preference'
  | 'habit_reliability'
  | 'risk_awareness'
  | 'sleep_stability'
  | 'energy_stability'
  | 'behavior_change_momentum'
  | 'pain_stability'
  | 'nutrition_consistency'
  | 'hydration_consistency'
  | 'emotional_stability';

export type WellnessProfileLevel =
  | 'very_low'
  | 'low'
  | 'moderate'
  | 'high'
  | 'very_high'
  | 'insufficient_data';

export type WellnessProfileTrendDirection = 'improving' | 'declining' | 'stable' | 'insufficient_data';

export interface WellnessProfileDimension {
  id: string;
  member_id: string;
  dimension: WellnessProfileDimensionKey;
  level: WellnessProfileLevel;
  score: number | null;
  confidence: number;
  trend_direction: WellnessProfileTrendDirection;
  evidence_count: number;
  rationale: string;
  contributing_evidence: WellnessIdentityEvidenceRef[];
  last_computed_at: string;
  created_at: string;
  updated_at: string;
}

export type CoachingTonePreference = 'encouragement' | 'direct' | 'education_first' | 'unclear';
export type CoachingDetailPreference = 'brief' | 'detailed' | 'unclear';
export type CoachingTaskLoadPreference = 'single_focus' | 'multi_task_ok' | 'unclear';

export interface WellnessCoachingStyleProfile {
  id: string;
  member_id: string;
  tone_preference: CoachingTonePreference;
  detail_preference: CoachingDetailPreference;
  task_load_preference: CoachingTaskLoadPreference;
  time_commitment_sweet_spot_minutes: number | null;
  confidence: number;
  evidence_count: number;
  rationale: string;
  last_computed_at: string;
  created_at: string;
  updated_at: string;
}

export type RecommendationFeedbackOutcome = 'surfaced' | 'completed' | 'dismissed' | 'ignored';

export interface WellnessRecommendationFeedback {
  id: string;
  member_id: string;
  recommendation_key: string;
  domain: string;
  consecutive_non_actions: number;
  last_outcome: RecommendationFeedbackOutcome;
  last_evidence_signature: string;
  suppressed: boolean;
  suppressed_reason: string | null;
  last_surfaced_at: string;
  created_at: string;
  updated_at: string;
}
