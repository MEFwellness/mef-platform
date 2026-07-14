/**
 * MEF Intelligence Engine (Milestone 8) — shared types for
 * intelligence_profile_snapshots and intelligence_coach_alerts
 * (supabase/migrations/00000000000034_mef_intelligence_engine.sql). Same
 * convention as every other *.types.ts file here: hand-authored, kept in
 * sync with the migration by hand, row/type contracts only — the rich
 * shapes each jsonb column holds (LongitudinalTrend, PatternInsight,
 * RootCauseHypothesis, CoachingPriorities, Recommendation, MemberSummary)
 * are defined and owned by apps/consumer-web-app/lib/intelligence-engine/types.ts,
 * not here, exactly like WellnessInsightDraft lives in
 * lib/intelligence/types.ts rather than in intelligence.types.ts.
 */

export type IntelligenceAlertType =
  | 'needs_review'
  | 'burnout_risk'
  | 'assessment_overdue'
  | 'no_checkin'
  | 'symptoms_worsening'
  | 'rapid_improvement'
  | 'plateau'
  | 'recurring_barriers'
  | 'repeated_safety_flags'
  | 'medical_evaluation_recommended'
  | 'assessment_finding_requires_attention';

export type IntelligenceAlertSeverity = 'info' | 'notable' | 'important';

export type IntelligenceAlertStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export interface IntelligenceEvidenceRef {
  type: string;
  id: string;
  note?: string;
}

export interface IntelligenceProfileSnapshot {
  id: string;
  member_id: string;
  local_date: string;
  engine_version: string;
  longitudinal: unknown[];
  patterns: unknown[];
  hypotheses: unknown[];
  priorities: Record<string, unknown>;
  recommendations: unknown[];
  member_summary: Record<string, unknown>;
  alert_count: number;
  created_at: string;
}

export interface IntelligenceCoachAlert {
  id: string;
  member_id: string;
  alert_type: IntelligenceAlertType;
  severity: IntelligenceAlertSeverity;
  title: string;
  reason: string;
  alert_key: string;
  evidence_refs: IntelligenceEvidenceRef[];
  source_refs: IntelligenceEvidenceRef[];
  safety_classification_id: string | null;
  status: IntelligenceAlertStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}
