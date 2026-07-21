/**
 * Universal Registry adapter — Wearable Integration Layer.
 *
 * Reshapes today's wearable_daily_metrics rows into registry_entries
 * (entry_kind='metric', domain='wearable') — never re-derives a value,
 * same discipline as adapters/bodyAssessment.ts. Full day-by-day history
 * stays queryable from wearable_daily_metrics itself (lib/wearables/data.ts's
 * listWearableMetricHistory); this adapter only maintains registry_entries'
 * current-snapshot-per-code, superseding yesterday's entry for the same
 * metric_code, so MemberHealthProfile / the Intelligence Engine /
 * Intelligence Core / Coach Intelligence see today's wearable state
 * through the exact same registry read path as every other domain, with
 * zero changes to those engines.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WearableDailyMetric } from '@mef/shared-types-contracts';
import { listWearableMetricsForDate } from '../../wearables/data';
import { findActiveRegistryEntry, insertRegistryEntry } from '../data';
import type { RegistryEntryDraft } from '../types';

const METRIC_LABEL: Record<WearableDailyMetric['metric_code'], string> = {
  sleep_duration_minutes: 'Sleep duration',
  sleep_score: 'Sleep score',
  sleep_stage_deep_minutes: 'Deep sleep',
  sleep_stage_rem_minutes: 'REM sleep',
  sleep_stage_light_minutes: 'Light sleep',
  bedtime_consistency_score: 'Bedtime consistency',
  resting_heart_rate: 'Resting heart rate',
  hrv_ms: 'Heart rate variability',
  readiness_score: 'Readiness',
  body_temperature_deviation: 'Body temperature deviation',
  steps: 'Steps',
  active_calories: 'Active calories',
  exercise_sessions_count: 'Exercise sessions',
  sedentary_minutes: 'Sedentary time',
  stress_score: 'Stress score',
  recovery_score: 'Recovery score',
};

export async function upsertRegistryEntriesFromWearableMetrics(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<void> {
  const metrics = await listWearableMetricsForDate(supabase, memberId, localDate);

  for (const metric of metrics) {
    const existing = await findActiveRegistryEntry(
      supabase,
      memberId,
      'wearable',
      metric.metric_code
    );
    if (existing && existing.source_record_id === metric.id) continue; // already registered, nothing changed

    const draft: RegistryEntryDraft = {
      entry_kind: 'metric',
      domain: 'wearable',
      code: metric.metric_code,
      label: METRIC_LABEL[metric.metric_code],
      severity: null,
      numeric_value: metric.numeric_value,
      unit: metric.unit,
      confidence: 1,
      narrative: null,
      evidence_refs: [],
      source_feature: 'wearable_daily_metric',
      source_record_id: metric.id,
      member_visible: true,
      coach_context: null,
      coach_reviewed_by: null,
      coach_reviewed_at: null,
      trend_status: null,
      recorded_at: metric.recorded_at,
    };

    await insertRegistryEntry(supabase, memberId, draft, {
      supersedesId: existing?.id ?? null,
    });
  }
}
