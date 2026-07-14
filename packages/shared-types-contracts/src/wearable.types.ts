/**
 * Wearable Integration Layer — shared types for wearable_connections and
 * wearable_daily_metrics
 * (supabase/migrations/00000000000044_wearable_integrations.sql). Same
 * convention as every other *.types.ts file here: hand-authored, kept in
 * sync with the migration by hand, row/type contracts only.
 *
 * wearable_daily_metrics is the Unified Daily Health Model — one row per
 * member/provider/local_date/metric_code. It is deliberately NOT the
 * Universal Registry: it's the durable per-day history a real provider
 * writes into and lib/wearables/trends.ts reads history from directly,
 * the same role body_assessment_findings plays for body assessment.
 * lib/registry/adapters/wearables.ts is what reshapes today's rows into
 * registry_entries (domain='wearable') for every other engine to read.
 */

export type WearableProviderName = 'oura' | 'apple_health' | 'google_fit';

export type WearableConnectionStatus = 'connected' | 'disconnected' | 'error';

/** Mirrors BodyAssessment's provider_status vocabulary exactly — 'not_configured' is the expected state until a real provider integration is wired in. */
export type WearableProviderStatus = 'not_configured' | 'pending' | 'active';

export interface WearableConnection {
  id: string;
  member_id: string;
  provider: WearableProviderName;
  status: WearableConnectionStatus;
  provider_status: WearableProviderStatus;
  external_account_label: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  connected_at: string;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
}

export type WearableMetricDomain = 'sleep' | 'recovery' | 'movement' | 'stress' | 'heart';

/** Fixed vocabulary covering every metric Part 1 of the milestone lists — additive only (new migration) as future providers surface more. */
export type WearableMetricCode =
  | 'sleep_duration_minutes'
  | 'sleep_score'
  | 'sleep_stage_deep_minutes'
  | 'sleep_stage_rem_minutes'
  | 'sleep_stage_light_minutes'
  | 'bedtime_consistency_score'
  | 'resting_heart_rate'
  | 'hrv_ms'
  | 'readiness_score'
  | 'body_temperature_deviation'
  | 'steps'
  | 'active_calories'
  | 'exercise_sessions_count'
  | 'sedentary_minutes'
  | 'stress_score'
  | 'recovery_score';

export interface WearableDailyMetric {
  id: string;
  member_id: string;
  connection_id: string;
  provider: WearableProviderName;
  local_date: string;
  metric_domain: WearableMetricDomain;
  metric_code: WearableMetricCode;
  numeric_value: number;
  unit: string | null;
  recorded_at: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
}
