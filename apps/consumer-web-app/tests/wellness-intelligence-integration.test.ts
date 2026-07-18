/**
 * End-to-end integration tests for the Personal Wellness Intelligence
 * Engine (lib/intelligence/*, app/actions/wellness-intelligence.ts)
 * against real local Supabase — real RLS, no mocked client, same
 * philosophy as tests/feed-integration.test.ts and
 * tests/safety-integration.test.ts.
 *
 * Uses a dedicated 2019 date range for memberOne's check-ins, disjoint
 * from every other integration suite's own fixture dates (2020-xx,
 * checkin.test.ts's 2020-03-15, the seed data's real "today"/"yesterday")
 * so recalculating intelligence here never sees another suite's rows.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { recalculateWellnessIntelligence } from '../lib/intelligence/service';
import {
  findActiveInsightByPatternKey,
  listInsightsForMember,
  setInsightStatus,
  setInsightPinned,
  setInsightCoachContext,
} from '../lib/intelligence/data';
import { gatherCoachingSignals } from '../lib/brain/service';

const AS_OF = '2019-06-30';
const DAY_MS = 86_400_000;

function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function submitCheckin(
  client: Awaited<ReturnType<typeof signInAs>>,
  localDate: string,
  overrides: Partial<{ stress_level: number; digestion_rating: number }> = {}
) {
  // Every field the test doesn't deliberately vary is pinned to a value
  // that scores comfortably in the 'good' band on the engine's own 0-100
  // scale (lib/wellness/wellness-index.ts) — NOT the neutral-looking "3"
  // on the 1-5 input scale, which actually scores 50 ('poor', <55) and
  // would silently manufacture unintended recurring_pattern insights for
  // mood/sleep/energy across every uniform day in this fixture.
  const { error } = await client.rpc('submit_daily_checkin', {
    p_timezone: 'America/New_York',
    p_local_date: localDate,
    p_mood_level: 4,
    p_sleep_quality: 4,
    p_sleep_duration: '7-8h',
    p_energy_level: 4,
    p_stress_level: overrides.stress_level ?? 2,
    p_water_cups: 6,
    p_digestion_rating: overrides.digestion_rating ?? 4,
    p_pain_discomfort_level: 0,
    p_movement_today: 'full_session',
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

/** Every date from `daysAgoStart` down to `daysAgoEnd` (inclusive), oldest first. */
function dateRange(daysAgoStart: number, daysAgoEnd: number): string[] {
  const dates: string[] = [];
  for (let d = daysAgoStart; d >= daysAgoEnd; d--) dates.push(addDays(AS_OF, -d));
  return dates;
}

const BATCH_SIZE = 12;

/**
 * Submits many days of check-ins in small sequential batches rather than
 * one giant Promise.all — this suite runs alongside every other
 * integration file against the same local Supabase instance, and firing
 * 30-60 concurrent RPC calls at once was observed to silently drop a few
 * under that combined load (enough to fall below
 * lib/intelligence/confidence.ts's MIN_SAMPLE_FOR_WINDOW and make a trend
 * read as insufficient_data instead of the real signal being tested).
 */
async function submitManyCheckins(
  client: Awaited<ReturnType<typeof signInAs>>,
  dates: string[],
  overrides: Partial<{ stress_level: number; digestion_rating: number }> = {}
): Promise<void> {
  for (let i = 0; i < dates.length; i += BATCH_SIZE) {
    const batch = dates.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((d) => submitCheckin(client, d, overrides)));
  }
}

/**
 * Submits an alternating stress_level 1/2 pattern (score ~87.5/100
 * average) rather than a uniform level — a single whole stress_level
 * step always swings the score by exactly 25 points on
 * lib/wellness/wellness-index.ts's scale, which always lands
 * 'important' severity (>=20) and is therefore always subject to
 * lib/intelligence/safety.ts's blanket "any open restriction + important
 * severity -> coach-only" rule. Alternating keeps the swing in the
 * 10-19 'notable' range instead, so this fixture's member_visible
 * outcome is deterministic regardless of what any other integration
 * suite concurrently does with this same seeded member's safety state.
 */
async function submitAlternatingStress(
  client: Awaited<ReturnType<typeof signInAs>>,
  dates: string[]
): Promise<void> {
  for (let i = 0; i < dates.length; i += BATCH_SIZE) {
    const batch = dates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((d, idx) => submitCheckin(client, d, { stress_level: (i + idx) % 2 === 0 ? 1 : 2 }))
    );
  }
}

afterAll(async () => {
  const service = serviceRoleClient();
  await service
    .from('daily_checkins')
    .delete()
    .eq('user_id', TEST_USERS.memberOne.id)
    .lte('local_date', addDays(AS_OF, 1))
    .gte('local_date', addDays(AS_OF, -95));
  await service.from('wellness_insights').delete().eq('member_id', TEST_USERS.memberOne.id);
  await service
    .from('safety_review_queue')
    .delete()
    .eq('member_id', TEST_USERS.memberOne.id)
    .eq('source_feature', 'wellness_intelligence');
  await service
    .from('safety_classifications')
    .delete()
    .eq('member_id', TEST_USERS.memberOne.id)
    .eq('source_feature', 'wellness_intelligence');
});

describe('recalculateWellnessIntelligence — persistence, dedup, supersede', () => {
  it('persists a real declining stress trend from a genuine 60-day history', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await submitManyCheckins(client, dateRange(59, 30), { stress_level: 1 }); // previous 30: uniformly good
    await submitAlternatingStress(client, dateRange(29, 0)); // last 30: a real, but 'notable' (not 'important'), decline

    await recalculateWellnessIntelligence(client, TEST_USERS.memberOne.id, AS_OF);

    const insight = await findActiveInsightByPatternKey(
      client,
      TEST_USERS.memberOne.id,
      'trend_stress'
    );
    expect(insight).not.toBeNull();
    expect(insight!.trend_state).toBe('declining');
    expect(insight!.severity).toBe('notable');
    expect(insight!.member_visible).toBe(true);
  }, 30000);

  it('re-running against the same unchanged history does not create a duplicate row', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const before = await findActiveInsightByPatternKey(
      client,
      TEST_USERS.memberOne.id,
      'trend_stress'
    );

    await recalculateWellnessIntelligence(client, TEST_USERS.memberOne.id, AS_OF);

    const after = await findActiveInsightByPatternKey(
      client,
      TEST_USERS.memberOne.id,
      'trend_stress'
    );
    expect(after!.id).toBe(before!.id); // same row, just re-confirmed
    expect(after!.last_confirmed_at).not.toBeNull();

    const all = await listInsightsForMember(client, TEST_USERS.memberOne.id, {
      statusFilter: ['active', 'confirmed'],
    });
    const stressRows = all.filter((i) => i.pattern_key === 'trend_stress');
    expect(stressRows).toHaveLength(1);
  });

  it('supersedes the old insight and reframes it as resolved once the underlying data genuinely improves', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const before = await findActiveInsightByPatternKey(
      client,
      TEST_USERS.memberOne.id,
      'trend_stress'
    );

    // Re-submit the last-30-day window with much better stress — a real, versioned update to the same dates.
    await submitManyCheckins(client, dateRange(29, 0), { stress_level: 1 });
    await recalculateWellnessIntelligence(client, TEST_USERS.memberOne.id, AS_OF);

    const oldRow = await client.from('wellness_insights').select('*').eq('id', before!.id).single();
    expect(oldRow.data!.status).toBe('superseded');
    expect(oldRow.data!.superseded_by_id).not.toBeNull();

    const current = await findActiveInsightByPatternKey(
      client,
      TEST_USERS.memberOne.id,
      'trend_stress'
    );
    expect(current!.id).not.toBe(before!.id);
    expect(current!.trend_state).toBe('resolved_or_inactive');
  }, 30000);

  it('never overwrites an insight once a coach has added their own context to it', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const insight = await findActiveInsightByPatternKey(
      memberClient,
      TEST_USERS.memberOne.id,
      'trend_stress'
    );
    const ok = await setInsightCoachContext(
      coachClient,
      insight!.id,
      'Discussed with member directly.',
      TEST_USERS.coachOne.id
    );
    expect(ok).toBe(true);

    // Push the data in a completely different direction and recalculate again.
    await submitManyCheckins(memberClient, dateRange(29, 0), { stress_level: 5 });
    await recalculateWellnessIntelligence(memberClient, TEST_USERS.memberOne.id, AS_OF);

    const stillThere = await memberClient
      .from('wellness_insights')
      .select('*')
      .eq('id', insight!.id)
      .single();
    expect(stillThere.data!.status).toBe('active'); // untouched — not superseded despite the data changing
    expect(stillThere.data!.coach_context).toBe('Discussed with member directly.');
  }, 30000);
});

describe('RLS — member vs. coach visibility', () => {
  it('a member cannot see a coach-only (member_visible=false) or dismissed insight, but the assigned coach can', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const coachClient = await signInAs(TEST_USERS.coachOne);

    // Recurring, uniformly-poor digestion across both 30-day windows — a genuinely serious, high-confidence pattern.
    await submitManyCheckins(memberClient, dateRange(59, 0), { digestion_rating: 1 });
    await recalculateWellnessIntelligence(memberClient, TEST_USERS.memberOne.id, AS_OF);

    const asCoach = await listInsightsForMember(coachClient, TEST_USERS.memberOne.id);
    const digestionInsight = asCoach.find((i) => i.pattern_key === 'trend_digestion');
    expect(digestionInsight).toBeDefined();

    // Dismiss it as the coach, then confirm the member's own read genuinely omits it (RLS, not just app filtering).
    const dismissed = await setInsightStatus(
      coachClient,
      digestionInsight!.id,
      'dismissed',
      TEST_USERS.coachOne.id
    );
    expect(dismissed).toBe(true);

    const { data: memberRead } = await memberClient
      .from('wellness_insights')
      .select('*')
      .eq('id', digestionInsight!.id);
    expect(memberRead).toEqual([]);

    const { data: coachRead } = await coachClient
      .from('wellness_insights')
      .select('*')
      .eq('id', digestionInsight!.id);
    expect(coachRead).toHaveLength(1);
    expect(coachRead![0]!.status).toBe('dismissed');
  }, 30000);

  it('coach pin/confirm/resolve actions are real, persisted state transitions', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const insights = await listInsightsForMember(coachClient, TEST_USERS.memberOne.id);
    const target = insights.find((i) => i.pattern_key === 'trend_digestion')!;

    expect(await setInsightPinned(coachClient, target.id, true, TEST_USERS.coachOne.id)).toBe(true);
    expect(await setInsightStatus(coachClient, target.id, 'resolved', TEST_USERS.coachOne.id)).toBe(
      true
    );

    const { data } = await coachClient
      .from('wellness_insights')
      .select('*')
      .eq('id', target.id)
      .single();
    expect(data!.is_pinned).toBe(true);
    expect(data!.status).toBe('resolved');
    expect(data!.last_confirmed_at).not.toBeNull();
    expect(data!.coach_reviewed_by).toBe(TEST_USERS.coachOne.id);
  });
});

describe('Safety integration — a serious recurring pattern opens a real Coach Review Queue entry', () => {
  it('routes source_feature "wellness_intelligence" into safety_classifications + safety_review_queue', async () => {
    const service = serviceRoleClient();
    const { data: classifications } = await service
      .from('safety_classifications')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('source_feature', 'wellness_intelligence');

    expect(classifications!.length).toBeGreaterThan(0);
    expect(classifications![0]!.classification_level).toBe('coach_review_required');

    const { data: reviews } = await service
      .from('safety_review_queue')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('source_feature', 'wellness_intelligence');
    expect(reviews!.length).toBeGreaterThan(0);
    expect(reviews![0]!.assigned_coach_id).toBe(TEST_USERS.coachOne.id);

    // And the insight itself was correctly downgraded to coach-only with the classification linked.
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const insights = await listInsightsForMember(coachClient, TEST_USERS.memberOne.id);
    const digestionInsight = insights.find((i) => i.pattern_key === 'trend_digestion');
    expect(digestionInsight!.safety_classification_id).not.toBeNull();
    expect(digestionInsight!.member_visible).toBe(false);
  });
});

describe('Coaching Brain integration', () => {
  it('a confirmed declining/recurring trend informs confirmedLongTermConcern, when fresh', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const insights = await listInsightsForMember(coachClient, TEST_USERS.memberOne.id);
    const digestionInsight = insights.find((i) => i.pattern_key === 'trend_digestion')!;

    // Confirm it (a coach action) and set updated_at to "today" (right now) via the service role.
    await setInsightStatus(coachClient, digestionInsight.id, 'confirmed', TEST_USERS.coachOne.id);
    const service = serviceRoleClient();
    const today = new Date().toISOString().slice(0, 10);
    await service
      .from('wellness_insights')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', digestionInsight.id);

    const signals = await gatherCoachingSignals(coachClient, TEST_USERS.memberOne.id, today);
    expect(signals.confirmedLongTermConcern).toBe('digestion');
  });

  it('a stale confirmed trend (updated long ago) is excluded from confirmedLongTermConcern', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const insights = await listInsightsForMember(coachClient, TEST_USERS.memberOne.id);
    const digestionInsight = insights.find((i) => i.pattern_key === 'trend_digestion')!;

    const service = serviceRoleClient();
    const longAgo = new Date(Date.now() - 60 * DAY_MS).toISOString();
    await service
      .from('wellness_insights')
      .update({ updated_at: longAgo })
      .eq('id', digestionInsight.id);

    const today = new Date().toISOString().slice(0, 10);
    const signals = await gatherCoachingSignals(coachClient, TEST_USERS.memberOne.id, today);
    expect(signals.confirmedLongTermConcern).toBeNull();
  });
});
