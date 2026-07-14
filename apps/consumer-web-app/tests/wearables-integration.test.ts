/**
 * End-to-end integration test for the full wearable sync pipeline against
 * real local Supabase — the one thing unit tests alone can't prove: that
 * a real sync, run under a member's own session (exactly how
 * app/actions/wearables.ts calls it), actually writes wearable_daily_metrics,
 * reshapes them into registry_entries via the Universal Registry adapter,
 * emits and dispatches the right proactive AiEvents, and lands a
 * member-readable notification in the Coach Messages inbox — with zero
 * mocking of Supabase, same philosophy as every other *-integration.test.ts
 * file in this suite.
 *
 * Uses registerWearableProvider to swap in a fixed-data test double for
 * 'oura' — the same provider-swap seam a real Oura integration would use,
 * see tests/wearables-providers.test.ts for the seam's own unit coverage.
 */
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { registerWearableProvider } from '../lib/wearables/providers/registry';
import { syncWearableConnection, todayLocalDate, daysAgoLocalDate } from '../lib/wearables/sync';
import { upsertWearableConnection } from '../lib/wearables/data';
import { listRegistryEntriesForMember } from '../lib/registry/data';
import { listNotifications } from '../lib/notifications/data';
import { listTimelineEvents } from '../lib/timeline/data';
import type { WearableProvider } from '../lib/wearables/providers/types';

const memberId = TEST_USERS.memberOne.id;

const UNCONFIGURED_OURA: WearableProvider = {
  name: 'oura',
  async fetchDailyMetrics() {
    throw new Error('oura is not configured.');
  },
};
const UNCONFIGURED_APPLE_HEALTH: WearableProvider = {
  name: 'apple_health',
  async fetchDailyMetrics() {
    throw new Error('apple_health is not configured.');
  },
};

async function wipeMemberFixtures(): Promise<void> {
  const service = serviceRoleClient();
  for (const table of [
    'wearable_connections', // cascades to wearable_daily_metrics
    'registry_entries',
    'health_timeline_events',
    'notifications',
    'ai_actions',
    'ai_recommendations',
    'ai_insights',
    'ai_events',
  ]) {
    await service.from(table).delete().eq('member_id', memberId);
  }
}

// Each test's own fixtures (connection, registry entries, events,
// notifications) must not bleed into the next — both tests below use the
// same seeded member, and only one of them (the first) creates real
// wearable-domain registry entries the second test asserts the *absence*
// of for its own provider.
afterEach(wipeMemberFixtures);

afterAll(async () => {
  // Restore both providers to their real unconfigured stubs so this test
  // file can't leak a fake provider into any other test.
  registerWearableProvider('oura', UNCONFIGURED_OURA);
  registerWearableProvider('apple_health', UNCONFIGURED_APPLE_HEALTH);
  delete process.env.OURA_CLIENT_ID;
});

describe('Wearable sync pipeline — end to end, real DB, member-own-session RLS', () => {
  it('a real first sync with declining HRV and excellent readiness flows all the way through to a Coach Message', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    process.env.OURA_CLIENT_ID = 'test-client-id';
    const connection = await upsertWearableConnection(memberClient, memberId, 'oura', {
      providerConfigured: true,
    });
    expect(connection).not.toBeNull();
    expect(connection!.last_synced_at).toBeNull(); // real first-sync state

    const today = todayLocalDate();
    const dayAgo1 = daysAgoLocalDate(1);
    const dayAgo2 = daysAgoLocalDate(2);

    const fakeProvider: WearableProvider = {
      name: 'oura',
      async fetchDailyMetrics() {
        return [
          {
            localDate: dayAgo2,
            metricDomain: 'heart',
            metricCode: 'hrv_ms',
            numericValue: 70,
            unit: 'ms',
            recordedAt: `${dayAgo2}T08:00:00.000Z`,
          },
          {
            localDate: dayAgo1,
            metricDomain: 'heart',
            metricCode: 'hrv_ms',
            numericValue: 60,
            unit: 'ms',
            recordedAt: `${dayAgo1}T08:00:00.000Z`,
          },
          {
            localDate: today,
            metricDomain: 'heart',
            metricCode: 'hrv_ms',
            numericValue: 50,
            unit: 'ms',
            recordedAt: `${today}T08:00:00.000Z`,
          },
          {
            localDate: today,
            metricDomain: 'recovery',
            metricCode: 'readiness_score',
            numericValue: 92,
            unit: null,
            recordedAt: `${today}T08:00:00.000Z`,
          },
          {
            localDate: today,
            metricDomain: 'sleep',
            metricCode: 'sleep_duration_minutes',
            numericValue: 450,
            unit: 'minutes',
            recordedAt: `${today}T08:00:00.000Z`,
          },
        ];
      },
    };
    registerWearableProvider('oura', fakeProvider);

    const result = await syncWearableConnection(memberClient, connection!);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // 1) Universal Registry — today's metrics reshaped, domain='wearable',
    //    visible through the exact same read path every other engine uses.
    const entries = await listRegistryEntriesForMember(memberClient, memberId, {
      statusFilter: ['active'],
    });
    const byCode = Object.fromEntries(entries.map((e) => [e.code, e]));
    expect(byCode.hrv_ms).toBeDefined();
    expect(byCode.hrv_ms!.domain).toBe('wearable');
    expect(byCode.hrv_ms!.entry_kind).toBe('metric');
    expect(byCode.hrv_ms!.numeric_value).toBe(50);
    expect(byCode.readiness_score!.numeric_value).toBe(92);
    expect(byCode.sleep_duration_minutes!.numeric_value).toBe(450);

    // 2) Proactive AiEvents were actually emitted and dispatched (not just
    //    computed in memory) — a real 3-day HRV decline and an excellent
    //    readiness score, plus the first-sync welcome.
    const { data: events, error: eventsError } = await memberClient
      .from('ai_events')
      .select('event_type, processed_at')
      .eq('member_id', memberId);
    expect(eventsError).toBeNull();
    const eventTypes = (events ?? []).map((e) => e.event_type);
    expect(eventTypes).toContain('wearable_synced');
    expect(eventTypes).toContain('hrv_declining');
    expect(eventTypes).toContain('recovery_excellent');
    expect((events ?? []).every((e) => e.processed_at !== null)).toBe(true);

    // 3) Coach Messages — real, member-readable notifications, written
    //    under the member's OWN session (the RLS gap this milestone's
    //    review fixed — migration 46).
    const notifications = await listNotifications(memberClient, memberId);
    const titles = notifications.map((n) => n.title);
    expect(titles).toContain('Oura connected');
    expect(titles).toContain('Your recovery is asking for attention');
    expect(titles).toContain('Your recovery looks excellent');
    expect(notifications.every((n) => n.type === 'proactive_coach_message')).toBe(true);
    expect(notifications.every((n) => n.read_at === null)).toBe(true);

    // 4) Personal Health Timeline — a real wearable_synced entry.
    const timeline = await listTimelineEvents(memberClient, memberId);
    expect(timeline.some((e) => e.event_type === 'wearable_synced')).toBe(true);

    // 5) Connection bookkeeping reflects a real, successful, "active" sync.
    const { data: refreshed } = await memberClient
      .from('wearable_connections')
      .select('*')
      .eq('id', connection!.id)
      .single();
    expect(refreshed!.provider_status).toBe('active');
    expect(refreshed!.last_synced_at).not.toBeNull();
    expect(refreshed!.last_sync_error).toBeNull();
  }, 30_000);

  it('a sync against an unconfigured provider is an honest no-op, but still welcomes the member', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const connection = await upsertWearableConnection(memberClient, memberId, 'apple_health', {
      providerConfigured: false,
    });
    expect(connection).not.toBeNull();

    const result = await syncWearableConnection(memberClient, connection!);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    const { data: refreshed } = await memberClient
      .from('wearable_connections')
      .select('*')
      .eq('id', connection!.id)
      .single();
    expect(refreshed!.provider_status).toBe('not_configured');

    // No metrics were ever fetched, so no wearable registry entries for
    // this provider's codes — an honest empty state, never fabricated.
    const entries = await listRegistryEntriesForMember(memberClient, memberId, {
      statusFilter: ['active'],
    });
    expect(entries.some((e) => e.domain === 'wearable')).toBe(false);

    // The first-sync bug fix under test: the welcome message fires even
    // though no real provider is configured yet.
    const notifications = await listNotifications(memberClient, memberId);
    expect(notifications.some((n) => n.title === 'Apple Health connected')).toBe(true);
  }, 30_000);
});
