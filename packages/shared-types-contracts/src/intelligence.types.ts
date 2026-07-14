/**
 * Personal Wellness Intelligence Engine (Milestone 6) — shared types for
 * wellness_insights (supabase/migrations/00000000000031_wellness_intelligence.sql).
 * Same convention as narrative.types.ts/safety.types.ts/feed.types.ts:
 * hand-authored, kept in sync with the migration by hand, row/type
 * contracts only (logic lives in apps/consumer-web-app/lib/intelligence/).
 */

import type { SafetyClassificationLevel } from './safety.types';

export type WellnessInsightType = 'trend' | 'pattern' | 'strength' | 'priority_summary';

/**
 * The wellness areas the engine analyzes. The 8 Daily Wellness Index
 * metrics (sleep..pain) reuse the exact same keys as
 * lib/wellness/wellness-index.ts's WellnessMetricKey; 'recovery' and
 * 'breathing' are member-facing area names without their own raw
 * check-in field (recovery ~ energy/pain, breathing ~ doctor_quiet
 * content) — see lib/intelligence/copy.ts for the exact mapping.
 * 'completed_actions' / 'lesson_engagement' / 'reflections' cover the
 * Daily Coaching Feed engagement side; the four `doctor_*` values cover
 * Four Doctors category-level patterns.
 */
export type WellnessArea =
  | 'sleep'
  | 'stress'
  | 'movement'
  | 'recovery'
  | 'hydration'
  | 'breathing'
  | 'digestion'
  | 'energy'
  | 'pain'
  | 'consistency'
  | 'mood'
  | 'completed_actions'
  | 'lesson_engagement'
  | 'reflections'
  | 'doctor_movement'
  | 'doctor_diet'
  | 'doctor_quiet'
  | 'doctor_happiness';

export type WellnessTrendState =
  | 'improving'
  | 'declining'
  | 'stable'
  | 'inconsistent'
  | 'insufficient_data'
  | 'newly_emerging'
  | 'recurring_pattern'
  | 'resolved_or_inactive';

/** A trend's own magnitude — distinct from severity (coach-attention weight) and confidence (how sure the engine is). */
export type WellnessTrendStrength = 'mild' | 'moderate' | 'strong';

export type WellnessInsightSeverity = 'info' | 'notable' | 'important';

export type WellnessIntelligenceTimeWindow =
  | 'last_7_days'
  | 'previous_7_days'
  | 'last_14_days'
  | 'last_30_days'
  | 'previous_30_days'
  | 'last_90_days'
  | 'since_baseline'
  | 'since_reassessment';

export type WellnessInsightStatus =
  'active' | 'confirmed' | 'dismissed' | 'resolved' | 'superseded' | 'stale';

export interface WellnessInsightEvidenceRef {
  type: string;
  id: string;
  note?: string;
}

export interface WellnessInsight {
  id: string;
  member_id: string;
  insight_type: WellnessInsightType;
  wellness_area: WellnessArea | null;
  trend_state: WellnessTrendState | null;
  trend_strength: WellnessTrendStrength | null;
  pattern_key: string;
  title: string;
  member_summary: string;
  coach_detail: string;
  confidence: number;
  severity: WellnessInsightSeverity;
  time_window: WellnessIntelligenceTimeWindow;
  evidence_refs: WellnessInsightEvidenceRef[];
  reasoning_codes: string[];
  recommended_coaching_response: string | null;
  recommended_coach_action: string | null;
  safety_classification_level: SafetyClassificationLevel;
  safety_classification_id: string | null;
  status: WellnessInsightStatus;
  is_pinned: boolean;
  pinned_by: string | null;
  pinned_at: string | null;
  coach_context: string | null;
  coach_reviewed_by: string | null;
  coach_reviewed_at: string | null;
  member_visible: boolean;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  last_confirmed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}
