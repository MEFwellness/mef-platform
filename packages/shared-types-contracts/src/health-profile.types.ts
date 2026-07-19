/**
 * Persisted Longitudinal Health Profile — shared types for
 * member_health_profiles
 * (supabase/migrations/00000000000041_member_health_profile.sql). Same
 * convention as every other *.types.ts file here: hand-authored, row/type
 * contract only. See that migration's own header for why this table exists
 * as a durable "current state index" rather than a duplicate of any
 * engine's already-computed output.
 */

export type HealthProfileRecalcTrigger =
  'assessment_published' | 'check_in' | 'onboarding' | 'reassessment' | 'manual';

/**
 * The compact jsonb rollup stored in member_health_profiles.summary — built
 * by apps/consumer-web-app/lib/health-profile/summary.ts from
 * already-computed engine output, never recomputed independently.
 */
export interface HealthProfileSummary {
  topPriorities: string[];
  activeRegistryFindingsBySeverity: Record<string, number>;
  wellnessInsightHighlights: string[];
  identityHighlights: string[];
  lastAssessmentPublishedAt: string | null;
}

export interface MemberHealthProfileRow {
  id: string;
  member_id: string;
  summary: HealthProfileSummary;
  latest_intelligence_snapshot_id: string | null;
  latest_wellness_insight_count: number;
  latest_registry_finding_count: number;
  overall_confidence: number | null;
  last_recalculated_at: string;
  last_recalculated_trigger: HealthProfileRecalcTrigger;
  created_at: string;
  updated_at: string;
}
