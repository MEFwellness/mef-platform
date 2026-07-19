'use server';

/**
 * Member-facing actions for the Wearable Integration Layer (Part 2 —
 * Member Connection Experience). The actual sync/detection logic lives in
 * lib/wearables/sync.ts so the daily cron job (app/api/cron/wearable-daily)
 * runs the exact same path with a service-role client, never a second
 * implementation.
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import type {
  WearableConnection,
  WearableDailyMetric,
  WearableProviderName,
} from '@mef/shared-types-contracts';
import {
  listWearableConnections,
  getWearableConnection,
  upsertWearableConnection,
  disconnectWearableConnection,
  listWearableMetricHistory,
} from '@/lib/wearables/data';
import { isWearableProviderConfigured } from '@/lib/wearables/providers/registry';
import { syncWearableConnection } from '@/lib/wearables/sync';

export async function getMyWearableConnections(): Promise<WearableConnection[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return listWearableConnections(supabase, user.id);
}

export async function connectWearableProvider(
  provider: WearableProviderName
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const connection = await upsertWearableConnection(supabase, user.id, provider, {
    providerConfigured: isWearableProviderConfigured(provider),
  });
  if (!connection) return { error: 'Could not connect right now — please try again.' };

  // Best-effort first sync right after connecting — same "never let a
  // best-effort side path affect the primary result" discipline as every
  // other emitAndDispatch caller in this codebase.
  try {
    await syncWearableConnection(supabase, connection);
  } catch (err) {
    console.error('Initial sync after connect failed', err);
  }

  return {};
}

export async function disconnectWearableProviderAction(
  connectionId: string
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const connection = await getWearableConnection(supabase, connectionId);
  if (!connection || connection.member_id !== user.id) {
    return { error: 'Connection not found.' };
  }

  const ok = await disconnectWearableConnection(supabase, connectionId);
  if (!ok) return { error: 'Could not disconnect right now — please try again.' };
  return {};
}

export async function syncWearableProviderAction(connectionId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const connection = await getWearableConnection(supabase, connectionId);
  if (!connection || connection.member_id !== user.id) {
    return { error: 'Connection not found.' };
  }

  const result = await syncWearableConnection(supabase, connection);
  if (!result.success) return { error: result.error ?? 'Sync failed.' };
  return {};
}

/** Oldest-first history for one metric — what a Recovery Trends chart on /progress reads. */
export async function getMyWearableMetricHistory(
  metricCode: WearableDailyMetric['metric_code'],
  days = 14
): Promise<WearableDailyMetric[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return listWearableMetricHistory(supabase, user.id, metricCode, { limit: days });
}
