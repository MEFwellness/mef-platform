/**
 * Coaching Intelligence Engine — shared types for coaching_insights
 * (supabase/migrations/00000000000066_coaching_insights.sql). Same
 * convention as every other *.types.ts file here: hand-authored, kept in
 * sync with the migration by hand, row/type contracts only — the
 * engine's internal working types (observations, source-provider
 * interface, evidence assembly) live in
 * apps/consumer-web-app/lib/coaching-insights/types.ts, not here.
 */

export type CoachingInsightCategory =
  'todays_insight' | 'recent_pattern' | 'weekly_observation' | 'watch' | 'small_win';

/**
 * Never skip directly to a higher level without the evidence a lower
 * level would require:
 *   1 — single observation (one real, recent data point).
 *   2 — repeated observation (a pattern across several recent instances
 *       of the same source+metric).
 *   3 — cross-feature observation (two different sources co-occurring on
 *       the same days with a real, counted skew).
 *   4 — long-term trend (a multi-week windowed trend).
 */
export type CoachingInsightLevel = 1 | 2 | 3 | 4;

export interface CoachingEvidenceRef {
  type: string;
  id: string;
  note?: string;
}

export interface CoachingInsight {
  id: string;
  member_id: string;
  local_date: string;
  category: CoachingInsightCategory;
  level: CoachingInsightLevel;
  statement: string;
  explanation: string;
  data_sources: string[];
  date_range_start: string;
  date_range_end: string;
  observation_count: number;
  confidence: number;
  evidence_refs: CoachingEvidenceRef[];
  generated_at: string;
  created_at: string;
}
