/**
 * The one real sync orchestration path — called by both the member-facing
 * manual "Sync now" action (app/actions/wearables.ts) and the daily cron
 * job (app/api/cron/wearable-daily/route.ts) so proactive detection never
 * diverges between "the member asked" and "it ran on schedule."
 *
 * Mirrors lib/health-profile/orchestration.ts's role for the assessment-
 * publish cascade: gather real data, write it, run the existing adapters/
 * detectors, emit whatever real AiEvents that data warrants, record a
 * timeline entry — never a second, parallel pipeline.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WearableConnection } from '@mef/shared-types-contracts';
import { getWearableProvider, isWearableProviderConfigured } from './providers/registry';
import { upsertWearableDailyMetrics, recordWearableSyncResult } from './data';
import { upsertRegistryEntriesFromWearableMetrics } from '../registry/adapters/wearables';
import { detectProactiveWearableEvents } from './detectProactiveEvents';
import { emitAndDispatch } from '../ai/events';
import { buildRuleFacts } from '../ai/rules/facts';
import { recordTimelineEvent } from '../timeline/data';
import { WEARABLE_PROVIDER_LABEL } from './labels';

const SYNC_LOOKBACK_DAYS = 7;

/** Plain UTC "today" — there is no per-member session in a cron invocation to resolve a timezone-aware local date from, same constraint app/api/cron/wearable-daily/route.ts operates under. */
export function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoLocalDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export type WearableSyncResult = { success: boolean; error?: string };

/**
 * Runs a single connection's sync end to end. Never throws — every
 * failure (including "provider not configured yet," which is an expected
 * state, not an error) is captured and recorded on the connection row
 * itself via recordWearableSyncResult.
 */
export async function syncWearableConnection(
  supabase: SupabaseClient,
  connection: WearableConnection
): Promise<WearableSyncResult> {
  const configured = isWearableProviderConfigured(connection.provider);
  const today = todayLocalDate();
  const facts = buildRuleFacts([], today);

  // The "thanks for connecting" welcome message is an acknowledgment of a
  // real member action (they connected a device) — it must fire on the
  // very first sync attempt regardless of whether a real provider is
  // configured yet, or a member who connects before any provider goes
  // live would never hear from the coach at all. Every metric-derived
  // event below this, by contrast, only ever fires from real synced data.
  const isFirstSync = connection.last_synced_at === null;
  if (isFirstSync) {
    await emitAndDispatch(
      supabase,
      {
        eventType: 'wearable_synced',
        memberId: connection.member_id,
        source: 'system',
        payload: { provider: connection.provider, isFirstSync: true },
      },
      facts
    );
    // Coach Timeline (section 3): "Connected Oura" is a milestone in its
    // own right, distinct from the routine wearable_synced entries every
    // later sync also writes below — worth its own entry exactly once.
    await recordTimelineEvent(supabase, {
      memberId: connection.member_id,
      eventType: 'wearable_connected',
      localDate: today,
      title: `Connected ${WEARABLE_PROVIDER_LABEL[connection.provider]}`,
      sourceFeature: 'wearable_connections',
      sourceRecordId: connection.id,
    });
  }

  // Every provider is an UnconfiguredProvider stub this milestone (see
  // lib/wearables/providers/registry.ts) — attempting a real fetch here
  // would only ever throw. That's an honest, expected state, not a sync
  // failure: record a clean success with nothing synced yet, same
  // "not_configured is not an error" posture body_assessments.provider_status
  // already established.
  if (!configured) {
    await supabase
      .from('wearable_connections')
      .update({ provider_status: 'not_configured', updated_at: new Date().toISOString() })
      .eq('id', connection.id);
    await recordWearableSyncResult(supabase, connection.id, { success: true });
    return { success: true };
  }

  try {
    await supabase
      .from('wearable_connections')
      .update({ provider_status: 'active', updated_at: new Date().toISOString() })
      .eq('id', connection.id);

    const provider = getWearableProvider(connection.provider);
    const sinceLocalDate = daysAgoLocalDate(SYNC_LOOKBACK_DAYS);

    const results = await provider.fetchDailyMetrics({
      connectionId: connection.id,
      memberId: connection.member_id,
      sinceLocalDate,
    });

    await upsertWearableDailyMetrics(
      supabase,
      connection.member_id,
      connection.id,
      connection.provider,
      results
    );

    await upsertRegistryEntriesFromWearableMetrics(supabase, connection.member_id, today);

    const proactiveEvents = await detectProactiveWearableEvents(supabase, connection.member_id);
    for (const proactiveEvent of proactiveEvents) {
      await emitAndDispatch(
        supabase,
        {
          eventType: proactiveEvent.eventType,
          memberId: connection.member_id,
          source: 'system',
          payload: proactiveEvent.payload,
        },
        facts
      );
    }

    await recordTimelineEvent(supabase, {
      memberId: connection.member_id,
      eventType: 'wearable_synced',
      localDate: today,
      title: `Synced ${WEARABLE_PROVIDER_LABEL[connection.provider]}`,
      sourceFeature: 'wearable_connections',
      sourceRecordId: connection.id,
    });

    await recordWearableSyncResult(supabase, connection.id, { success: true });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordWearableSyncResult(supabase, connection.id, { success: false, error: message });
    return { success: false, error: message };
  }
}
