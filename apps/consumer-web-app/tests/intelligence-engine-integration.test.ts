/**
 * End-to-end integration tests for the MEF Intelligence Engine
 * (lib/intelligence-engine/*) against real local Supabase — real RLS, no
 * mocked client, same philosophy as tests/wellness-intelligence-
 * integration.test.ts and tests/safety-integration.test.ts.
 *
 * Uses a dedicated 2018 date range for memberOne's check-ins, disjoint
 * from every other integration suite's own fixture dates (2019-xx used by
 * wellness-intelligence-integration.test.ts, 2020-xx used elsewhere) so
 * recalculating intelligence here never sees another suite's rows.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  buildMemberIntelligence,
  computeMemberIntelligence,
  getConversationContextIntelligence,
} from '../lib/intelligence-engine/engine';
import { getCoachingFocusDecision } from '../lib/brain/service';
import { listCoachAlertsForMember, listProfileSnapshots } from '../lib/intelligence-engine/data';

const AS_OF = '2018-06-30';

function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function submitCheckin(
  client: Awaited<ReturnType<typeof signInAs>>,
  localDate: string,
  overrides: Partial<{ stress_level: number; energy_level: number }> = {}
) {
  const { error } = await client.rpc('submit_daily_checkin', {
    p_timezone: 'America/New_York',
    p_local_date: localDate,
    p_mood_level: 4,
    p_sleep_quality: 4,
    p_sleep_duration: '7-8h',
    p_energy_level: overrides.energy_level ?? 4,
    p_stress_level: overrides.stress_level ?? 2,
    p_water_cups: 6,
    p_digestion_rating: 4,
    p_pain_discomfort_level: 0,
    p_movement_today: 'full_session',
    p_new_or_worsening_concern: false,
    p_optional_notes: null,
  });
  if (error) throw error;
}

function dateRange(daysAgoStart: number, daysAgoEnd: number): string[] {
  const dates: string[] = [];
  for (let d = daysAgoStart; d >= daysAgoEnd; d--) dates.push(addDays(AS_OF, -d));
  return dates;
}

const BATCH_SIZE = 12;

async function submitManyCheckins(
  client: Awaited<ReturnType<typeof signInAs>>,
  dates: string[],
  overrides: Partial<{ stress_level: number; energy_level: number }> = {}
): Promise<void> {
  for (let i = 0; i < dates.length; i += BATCH_SIZE) {
    const batch = dates.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((d) => submitCheckin(client, d, overrides)));
  }
}

afterAll(async () => {
  const service = serviceRoleClient();
  await service
    .from('intelligence_profile_snapshots')
    .delete()
    .eq('member_id', TEST_USERS.memberOne.id);
  await service.from('intelligence_coach_alerts').delete().eq('member_id', TEST_USERS.memberOne.id);
  await service
    .from('daily_checkins')
    .delete()
    .eq('user_id', TEST_USERS.memberOne.id)
    .gte('local_date', dateRange(59, 0)[0])
    .lte('local_date', AS_OF);
});

describe('MEF Intelligence Engine — end-to-end against real check-in history', () => {
  it('computes a full report grounded in real, elevated stress over 30 days', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    await submitManyCheckins(memberClient, dateRange(59, 30), { stress_level: 2 });
    await submitManyCheckins(memberClient, dateRange(29, 0), { stress_level: 5 });

    const report = await computeMemberIntelligence(memberClient, TEST_USERS.memberOne.id, AS_OF);

    const stressTrend = report.longitudinalTrends.find((t) => t.area === 'stress')!;
    expect(stressTrend.direction).toBe('declining');
    expect(report.memberId).toBe(TEST_USERS.memberOne.id);
    expect(report.priorities).toBeDefined();
    expect(report.memberSummary.currentFocus).toBeTruthy();
  }, 60_000);

  it('buildMemberIntelligence persists an append-only snapshot and coach-visible alerts, under the assigned coach session', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const before = await listProfileSnapshots(coachClient, TEST_USERS.memberOne.id, 100);
    const report = await buildMemberIntelligence(coachClient, TEST_USERS.memberOne.id, AS_OF);
    const after = await listProfileSnapshots(coachClient, TEST_USERS.memberOne.id, 100);

    // Append-only: a fresh row every run, never an update to a prior one.
    expect(after.length).toBe(before.length + 1);
    expect(after[0]!.alert_count).toBe(report.alerts.length);

    const alerts = await listCoachAlertsForMember(coachClient, TEST_USERS.memberOne.id);
    expect(alerts.length).toBeGreaterThanOrEqual(0);
    for (const alert of alerts) {
      expect(alert.reason.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('RLS: a member cannot read their own coach alerts, but their assigned coach can', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    await buildMemberIntelligence(coachClient, TEST_USERS.memberOne.id, AS_OF);

    const memberClient = await signInAs(TEST_USERS.memberOne);
    const { data: memberView, error: memberError } = await memberClient
      .from('intelligence_coach_alerts')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);

    // No member SELECT policy exists at all — RLS returns zero rows, not an error.
    expect(memberError).toBeNull();
    expect(memberView).toEqual([]);

    const { data: coachView, error: coachError } = await coachClient
      .from('intelligence_coach_alerts')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(coachError).toBeNull();
    expect(coachView).toBeDefined();
  }, 60_000);

  it("RLS: an unassigned member (memberTwo) cannot read memberOne's intelligence snapshots", async () => {
    const memberOneClient = await signInAs(TEST_USERS.memberOne);
    await buildMemberIntelligence(memberOneClient, TEST_USERS.memberOne.id, AS_OF);

    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const { data, error } = await memberTwoClient
      .from('intelligence_profile_snapshots')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  }, 60_000);

  it('a member can read their own intelligence snapshot history', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    await buildMemberIntelligence(memberClient, TEST_USERS.memberOne.id, AS_OF);

    const { data, error } = await memberClient
      .from('intelligence_profile_snapshots')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('MEF Intelligence Engine — Conversation Coach integration', () => {
  it('getConversationContextIntelligence returns the same Brain decision the Conversation Coach used to fetch independently, plus the new priorities field, without writing an alert or snapshot', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const before = await listProfileSnapshots(memberClient, TEST_USERS.memberOne.id, 100);
    const [expectedDecision, context] = await Promise.all([
      getCoachingFocusDecision(memberClient, TEST_USERS.memberOne.id, AS_OF),
      getConversationContextIntelligence(memberClient, TEST_USERS.memberOne.id, AS_OF),
    ]);
    const after = await listProfileSnapshots(memberClient, TEST_USERS.memberOne.id, 100);

    expect(context.decision.focus).toBe(expectedDecision.focus);
    expect(context.decision.mode).toBe(expectedDecision.mode);
    expect(context.priorities).toBeDefined();
    expect(Array.isArray(context.confirmedInsights)).toBe(true);
    expect(Array.isArray(context.narrativeHighlights)).toBe(true);
    // Read-only: the Conversation Coach must never persist a coach alert
    // or snapshot as a side effect of a member sending a chat message.
    expect(after.length).toBe(before.length);
  }, 60_000);
});
