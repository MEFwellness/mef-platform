/**
 * Database access for the Wearable Integration Layer — same shape as
 * lib/registry/data.ts: pure functions taking a SupabaseClient, RLS
 * (migration 44) decides who may read/write what.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  WearableConnection,
  WearableDailyMetric,
  WearableProviderName,
} from '@mef/shared-types-contracts';
import type { WearableDailyMetricResult } from './providers/types';

export async function listWearableConnections(
  supabase: SupabaseClient,
  memberId: string
): Promise<WearableConnection[]> {
  const { data, error } = await supabase
    .from('wearable_connections')
    .select('*')
    .eq('member_id', memberId)
    .order('connected_at', { ascending: false });

  if (error) {
    console.error('listWearableConnections failed', error);
    return [];
  }
  return data as WearableConnection[];
}

export async function getWearableConnection(
  supabase: SupabaseClient,
  connectionId: string
): Promise<WearableConnection | null> {
  const { data, error } = await supabase
    .from('wearable_connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle();

  if (error) {
    console.error('getWearableConnection failed', error);
    return null;
  }
  return data as WearableConnection | null;
}

/**
 * Connecting a provider a member already has a (disconnected) row for
 * reconnects that same row — upsert on the (member_id, provider) unique
 * constraint — rather than accumulating duplicate connection rows.
 */
export async function upsertWearableConnection(
  supabase: SupabaseClient,
  memberId: string,
  provider: WearableProviderName,
  options: { providerConfigured: boolean }
): Promise<WearableConnection | null> {
  const { data, error } = await supabase
    .from('wearable_connections')
    .upsert(
      {
        member_id: memberId,
        provider,
        status: 'connected',
        provider_status: options.providerConfigured ? 'pending' : 'not_configured',
        disconnected_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'member_id,provider' }
    )
    .select('*')
    .single();

  if (error) {
    console.error('upsertWearableConnection failed', error);
    return null;
  }
  return data as WearableConnection;
}

export async function disconnectWearableConnection(
  supabase: SupabaseClient,
  connectionId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('wearable_connections')
    .update({
      status: 'disconnected',
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);

  if (error) {
    console.error('disconnectWearableConnection failed', error);
    return false;
  }
  return true;
}

export async function recordWearableSyncResult(
  supabase: SupabaseClient,
  connectionId: string,
  result: { success: boolean; error?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('wearable_connections')
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_error: result.success ? null : (result.error ?? 'Sync failed'),
      status: result.success ? 'connected' : 'error',
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);

  if (error) console.error('recordWearableSyncResult failed', error);
}

/** Upserted on (member_id, provider, local_date, metric_code) — a re-sync overwrites the same day's value rather than duplicating it. */
export async function upsertWearableDailyMetrics(
  supabase: SupabaseClient,
  memberId: string,
  connectionId: string,
  provider: WearableProviderName,
  metrics: WearableDailyMetricResult[]
): Promise<void> {
  if (metrics.length === 0) return;

  const rows = metrics.map((metric) => ({
    member_id: memberId,
    connection_id: connectionId,
    provider,
    local_date: metric.localDate,
    metric_domain: metric.metricDomain,
    metric_code: metric.metricCode,
    numeric_value: metric.numericValue,
    unit: metric.unit,
    recorded_at: metric.recordedAt,
    raw_payload: metric.rawPayload ?? {},
  }));

  const { error } = await supabase
    .from('wearable_daily_metrics')
    .upsert(rows, { onConflict: 'member_id,provider,local_date,metric_code' });

  if (error) console.error('upsertWearableDailyMetrics failed', error);
}

/** Oldest-first history for a single metric code — what trend detection (lib/wearables/trends.ts) and any trend chart read. */
export async function listWearableMetricHistory(
  supabase: SupabaseClient,
  memberId: string,
  metricCode: WearableDailyMetric['metric_code'],
  options: { limit?: number } = {}
): Promise<WearableDailyMetric[]> {
  const { data, error } = await supabase
    .from('wearable_daily_metrics')
    .select('*')
    .eq('member_id', memberId)
    .eq('metric_code', metricCode)
    .order('local_date', { ascending: false })
    .limit(options.limit ?? 14);

  if (error) {
    console.error('listWearableMetricHistory failed', error);
    return [];
  }
  return (data as WearableDailyMetric[]).reverse(); // oldest first
}

/** Every metric recorded for one local date — what the registry adapter reshapes into registry_entries. */
export async function listWearableMetricsForDate(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<WearableDailyMetric[]> {
  const { data, error } = await supabase
    .from('wearable_daily_metrics')
    .select('*')
    .eq('member_id', memberId)
    .eq('local_date', localDate);

  if (error) {
    console.error('listWearableMetricsForDate failed', error);
    return [];
  }
  return data as WearableDailyMetric[];
}
