/**
 * End-to-end integration tests for the MEF Wellness Intelligence Core
 * (lib/intelligence-core/*) against real local Supabase — real RLS, no
 * mocked client, same philosophy as tests/intelligence-engine-
 * integration.test.ts.
 *
 * Uses a dedicated 2017 date range for memberOne's check-ins/feed history,
 * disjoint from every other integration suite's own fixture dates (2018
 * used by intelligence-engine-integration.test.ts, 2019 by
 * wellness-intelligence-integration.test.ts, 2020 elsewhere).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  recalculateIntelligenceCore,
  getIntelligenceCoreSummary,
} from '../lib/intelligence-core/service';
import {
  listIdentityObservationsForMember,
  listProfileDimensionsForMember,
  getCoachingStyleProfile,
} from '../lib/intelligence-core/data';
import { toMemberWellnessHighlights } from '../lib/intelligence-core/memberView';

const AS_OF = '2017-06-30';

function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateRange(daysAgoStart: number, daysAgoEnd: number): string[] {
  const dates: string[] = [];
  for (let d = daysAgoStart; d >= daysAgoEnd; d--) dates.push(addDays(AS_OF, -d));
  return dates;
}

async function submitCheckin(
  client: Awaited<ReturnType<typeof signInAs>>,
  localDate: string,
  overrides: Partial<{
    mood_level: number;
    movement_today: 'none' | 'light' | 'moderate' | 'full_session';
  }> = {}
) {
  const { error } = await client.rpc('submit_daily_checkin', {
    p_timezone: 'America/New_York',
    p_local_date: localDate,
    p_mood_level: overrides.mood_level ?? 3,
    p_sleep_quality: 3,
    p_sleep_duration: '6-7h',
    p_energy_level: 3,
    p_stress_level: 3,
    p_water_cups: 6,
    p_digestion_rating: 3,
    p_pain_discomfort_level: 1,
    p_movement_today: overrides.movement_today ?? 'light',
    p_new_or_worsening_concern: false,
    p_optional_notes: null,
    p_actual_bedtime: null,
    p_actual_wake_time: null,
    p_night_waking_count: null,
    p_night_sweats: null,
    p_morning_soreness: null,
    p_bowel_movement_status: null,
  });
  if (error) throw error;
}

const BATCH_SIZE = 12;

async function submitManyCheckins(
  client: Awaited<ReturnType<typeof signInAs>>,
  dates: string[],
  overrides: Partial<{
    mood_level: number;
    movement_today: 'none' | 'light' | 'moderate' | 'full_session';
  }> = {}
): Promise<void> {
  for (let i = 0; i < dates.length; i += BATCH_SIZE) {
    const batch = dates.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((d) => submitCheckin(client, d, overrides)));
  }
}

afterAll(async () => {
  const service = serviceRoleClient();
  const memberId = TEST_USERS.memberOne.id;
  for (const table of [
    'wellness_identity_observations',
    'wellness_profile_dimensions',
    'wellness_coaching_style_profile',
    'wellness_recommendation_feedback',
  ]) {
    await service.from(table).delete().eq('member_id', memberId);
  }
  await service
    .from('daily_checkins')
    .delete()
    .eq('user_id', memberId)
    .gte('local_date', dateRange(59, 0)[0])
    .lte('local_date', AS_OF);
});

describe('Wellness Intelligence Core — end-to-end against real check-in history', () => {
  it("recalculateIntelligenceCore persists identity observations, profile dimensions, and a coaching style, under the member's own session", async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    // Movement days get noticeably better mood than rest days, over 40 days —
    // enough real signal for deriveMovementResponseObservation to fire.
    await submitManyCheckins(memberClient, dateRange(39, 20), {
      movement_today: 'full_session',
      mood_level: 5,
    });
    await submitManyCheckins(memberClient, dateRange(19, 0), {
      movement_today: 'none',
      mood_level: 2,
    });

    await recalculateIntelligenceCore(memberClient, TEST_USERS.memberOne.id, AS_OF);

    const observations = await listIdentityObservationsForMember(
      memberClient,
      TEST_USERS.memberOne.id,
      {
        statusFilter: ['active'],
      }
    );
    expect(observations.length).toBeGreaterThan(0);
    const movementObservation = observations.find((o) => o.domain === 'movement_response');
    expect(movementObservation).toBeDefined();
    expect(movementObservation!.confidence).toBeGreaterThan(0);
    expect(movementObservation!.evidence_count).toBeGreaterThanOrEqual(20);

    // wellness_profile_dimensions/wellness_coaching_style_profile have no
    // member SELECT policy (coach-internal working data) — read them back
    // under the assigned coach's session, same trust boundary as
    // intelligence_coach_alerts.
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const dimensions = await listProfileDimensionsForMember(coachClient, TEST_USERS.memberOne.id);
    expect(dimensions.length).toBe(15);
    const emotionalStability = dimensions.find((d) => d.dimension === 'emotional_stability')!;
    expect(emotionalStability.score).not.toBeNull();

    const style = await getCoachingStyleProfile(coachClient, TEST_USERS.memberOne.id);
    expect(style).not.toBeNull();
  }, 60_000);

  it('recalculating again touches the same observation rather than duplicating it, and dimensions stay at exactly one row per (member, dimension)', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    await recalculateIntelligenceCore(memberClient, TEST_USERS.memberOne.id, AS_OF);
    await recalculateIntelligenceCore(memberClient, TEST_USERS.memberOne.id, AS_OF);

    const observations = await listIdentityObservationsForMember(
      memberClient,
      TEST_USERS.memberOne.id,
      {
        statusFilter: ['active'],
      }
    );
    // Scoped to this specific observation_key, not the whole movement_response
    // domain — a second, independent detector in that same domain
    // (deriveMovementResponseFromRegistryObservation, keyed
    // 'movement_response_body_assessment_finding') can also produce an active
    // row when this member has a registered Universal Registry finding (see
    // tests/registry-adapters-integration.test.ts, which runs against this
    // same seeded member); this assertion is about the mood-lift detector
    // specifically not duplicating itself, not about domain-wide uniqueness.
    const movementObservations = observations.filter(
      (o) => o.domain === 'movement_response' && o.observation_key === 'movement_response_mood_lift'
    );
    expect(movementObservations).toHaveLength(1);

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const dimensions = await listProfileDimensionsForMember(coachClient, TEST_USERS.memberOne.id);
    expect(dimensions).toHaveLength(15);
    const dimensionKeys = new Set(dimensions.map((d) => d.dimension));
    expect(dimensionKeys.size).toBe(15);
  }, 60_000);

  it('RLS: a member can read their own active identity observations, but not profile dimensions or the coaching style profile directly', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const { data: ownObservations, error: obsError } = await memberClient
      .from('wellness_identity_observations')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(obsError).toBeNull();
    expect(ownObservations!.length).toBeGreaterThan(0);

    const { data: dimensionRows, error: dimError } = await memberClient
      .from('wellness_profile_dimensions')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(dimError).toBeNull();
    expect(dimensionRows).toEqual([]); // no member SELECT policy — coach-internal working data

    const { data: styleRows, error: styleError } = await memberClient
      .from('wellness_coaching_style_profile')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(styleError).toBeNull();
    expect(styleRows).toEqual([]);
  }, 60_000);

  it("RLS: an unassigned member (memberTwo) cannot read memberOne's identity observations", async () => {
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const { data, error } = await memberTwoClient
      .from('wellness_identity_observations')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  }, 60_000);

  it("getIntelligenceCoreSummary (coach session) returns capped prioritization and the member's dimensions/style", async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    await recalculateIntelligenceCore(coachClient, TEST_USERS.memberOne.id, AS_OF);

    const summary = await getIntelligenceCoreSummary(coachClient, TEST_USERS.memberOne.id, AS_OF);
    expect(summary.memberId).toBe(TEST_USERS.memberOne.id);
    expect(summary.prioritization.secondary.length).toBeLessThanOrEqual(2);
    expect(summary.profileDimensions.length).toBe(15);
    expect(summary.coachingStyle).toBeDefined();
    expect(Array.isArray(summary.identityObservations)).toBe(true);
  }, 60_000);

  it('the member-safe highlight view never includes confidence, evidence, or domain codes', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const observations = await listIdentityObservationsForMember(
      memberClient,
      TEST_USERS.memberOne.id,
      {
        statusFilter: ['active'],
      }
    );
    const highlights = toMemberWellnessHighlights(observations);
    for (const highlight of highlights) {
      expect(Object.keys(highlight).sort()).toEqual(['id', 'statement']);
    }
  }, 60_000);
});
