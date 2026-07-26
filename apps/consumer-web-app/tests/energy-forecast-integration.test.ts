/**
 * End-to-end tests for the Forecast & Calibration Loop against real local
 * Supabase — real RLS, real triggers, no mocked client (same philosophy
 * as tests/correlation-engine-integration.test.ts). Covers the three
 * requirements that can't be proven by a pure unit test alone:
 *   1. A forecast is a permanent record — the database trigger (migration
 *      111), not just application code, refuses to edit it after the
 *      fact, and refuses to score it twice.
 *   2. A skipped forecast produces no row at all, never a default value.
 *   3. The calibration section (percentages + chart data) only appears
 *      once BOTH her and Root's scored-forecast counts clear the
 *      configured minimum — proven against the real assembled
 *      buildEndingScreenView, not just the isolated threshold function.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { recordForecastsFromEveningReflection, buildEndingScreenView } from '../lib/energy-forecast/service';
import { MIN_SCORED_FORECASTS_FOR_CALIBRATION } from '../lib/energy-forecast/constants';
import type { DailyCheckin } from '@mef/shared-types-contracts';

const memberId = TEST_USERS.memberOne.id;

// A distinctive, far-past date range no other test's fixtures should touch.
const FAR_PAST_START = '2019-03-01';

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeFakeCheckin(localDate: string, energyLevel: number): DailyCheckin {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    user_id: memberId,
    recorded_at: new Date().toISOString(),
    checkin_version: 1,
    edited_at: null,
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    created_at: new Date().toISOString(),
    timezone: 'America/New_York',
    local_date: localDate,
    mood_level: 3,
    sleep_quality: 3,
    sleep_duration: '7-8h',
    energy_level: energyLevel,
    stress_level: 3,
    water_cups: 4,
    digestion_rating: null,
    pain_discomfort_level: 1,
    movement_today: null,
    new_or_worsening_concern: false,
    optional_notes: null,
    actual_bedtime: '22:30',
    actual_wake_time: '06:30',
    night_waking_count: 0,
    night_sweats: false,
    morning_soreness: 1,
    bowel_movement_status: 'normal',
  };
}

async function cleanup() {
  const service = serviceRoleClient();
  await service.from('energy_forecasts').delete().eq('member_id', memberId).gte('forecast_date', FAR_PAST_START);
  await service.from('root_energy_forecasts').delete().eq('member_id', memberId).gte('forecast_date', FAR_PAST_START);
  await service.from('daily_checkins').delete().eq('user_id', memberId).gte('local_date', FAR_PAST_START);
  // hasEarnedFinding() looks at ALL of this member's pattern states, not
  // just this test's date range — cleared so the calibration/handoff
  // tests below are deterministic regardless of what other suites left
  // behind for this shared seeded member.
  await service.from('member_pattern_states').delete().eq('member_id', memberId).eq('signal_kind', 'correlation_finding');
}

describe('energy_forecasts — permanent record, enforced by the database trigger (migration 111)', () => {
  const date = addDays(FAR_PAST_START, 1);

  beforeAll(cleanup);
  afterEach(cleanup);
  afterAll(cleanup);

  it('refuses to change the prediction itself once made, even for the member who owns it', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const { error: insertError } = await client.from('energy_forecasts').insert({
      member_id: memberId,
      forecast_date: date,
      made_from_local_date: addDays(date, -1),
      predicted_energy_level: 4,
    });
    expect(insertError).toBeNull();

    const { error: predictionEditError } = await client
      .from('energy_forecasts')
      .update({ predicted_energy_level: 1 })
      .eq('member_id', memberId)
      .eq('forecast_date', date);
    expect(predictionEditError).not.toBeNull();
    expect(predictionEditError!.message).toMatch(/permanent record/i);

    const { error: dateEditError } = await client
      .from('energy_forecasts')
      .update({ forecast_date: addDays(date, 5) })
      .eq('member_id', memberId)
      .eq('forecast_date', date);
    expect(dateEditError).not.toBeNull();

    // The prediction really is untouched after both refused edits.
    const { data: after } = await client
      .from('energy_forecasts')
      .select('predicted_energy_level, forecast_date')
      .eq('member_id', memberId)
      .eq('forecast_date', date)
      .single();
    expect(after!.predicted_energy_level).toBe(4);
    expect(after!.forecast_date).toBe(date);
  });

  it('can be scored exactly once, and a second scoring attempt is refused', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await client.from('energy_forecasts').insert({
      member_id: memberId,
      forecast_date: date,
      made_from_local_date: addDays(date, -1),
      predicted_energy_level: 3,
    });

    const { error: firstScoreError } = await client
      .from('energy_forecasts')
      .update({ actual_energy_level: 4, gap: 1, scored_at: new Date().toISOString() })
      .eq('member_id', memberId)
      .eq('forecast_date', date);
    expect(firstScoreError).toBeNull();

    const { error: secondScoreError } = await client
      .from('energy_forecasts')
      .update({ actual_energy_level: 2, gap: -1, scored_at: new Date().toISOString() })
      .eq('member_id', memberId)
      .eq('forecast_date', date);
    expect(secondScoreError).not.toBeNull();
    expect(secondScoreError!.message).toMatch(/already been scored/i);

    const { data: after } = await client
      .from('energy_forecasts')
      .select('actual_energy_level, gap')
      .eq('member_id', memberId)
      .eq('forecast_date', date)
      .single();
    expect(after!.actual_energy_level).toBe(4); // the first, real score — never overwritten
  });
});

describe('root_energy_forecasts — same permanence, same one-time scoring', () => {
  const date = addDays(FAR_PAST_START, 2);

  beforeAll(cleanup);
  afterEach(cleanup);
  afterAll(cleanup);

  it('refuses to change the prediction once made', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await client.from('root_energy_forecasts').insert({
      member_id: memberId,
      forecast_date: date,
      predicted_energy_level: 3,
      basis_observation_count: 5,
    });

    const { error } = await client
      .from('root_energy_forecasts')
      .update({ predicted_energy_level: 5 })
      .eq('member_id', memberId)
      .eq('forecast_date', date);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/permanent record/i);
  });
});

describe('a skipped forecast produces no score — never a substituted default', () => {
  const eveningDate = addDays(FAR_PAST_START, 10);
  const forecastDate = addDays(eveningDate, 1);

  beforeAll(cleanup);
  afterEach(cleanup);
  afterAll(cleanup);

  it('writes no energy_forecasts row at all when she leaves the question blank', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await recordForecastsFromEveningReflection(client, memberId, eveningDate, null);

    const { data, error } = await client
      .from('energy_forecasts')
      .select('*')
      .eq('member_id', memberId)
      .eq('forecast_date', forecastDate)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull(); // absence, not a null-valued placeholder row
  });
});

describe('the ending screen never shows calibration (percentages or chart) from too few results', () => {
  const today = addDays(FAR_PAST_START, 100);

  beforeAll(cleanup);
  afterEach(cleanup);
  afterAll(cleanup);

  async function seedScoredPair(service: ReturnType<typeof serviceRoleClient>, date: string) {
    await service.from('energy_forecasts').insert({
      member_id: memberId,
      forecast_date: date,
      made_from_local_date: addDays(date, -1),
      predicted_energy_level: 3,
      actual_energy_level: 3,
      gap: 0,
      scored_at: new Date().toISOString(),
    });
    await service.from('root_energy_forecasts').insert({
      member_id: memberId,
      forecast_date: date,
      predicted_energy_level: 3,
      basis_observation_count: 5,
      actual_energy_level: 3,
      gap: 0,
      scored_at: new Date().toISOString(),
    });
  }

  it('stays hidden when today would only be the 4th scored result', async () => {
    const service = serviceRoleClient();
    for (let i = 1; i <= MIN_SCORED_FORECASTS_FOR_CALIBRATION - 2; i++) {
      await seedScoredPair(service, addDays(today, -i));
    }
    // Today's own forecast, still unscored — buildEndingScreenView scores it.
    await service.from('energy_forecasts').insert({
      member_id: memberId,
      forecast_date: today,
      made_from_local_date: addDays(today, -1),
      predicted_energy_level: 3,
    });
    await service.from('root_energy_forecasts').insert({
      member_id: memberId,
      forecast_date: today,
      predicted_energy_level: 3,
      basis_observation_count: 5,
    });

    const view = await buildEndingScreenView(service, memberId, today, makeFakeCheckin(today, 3));
    expect(view.kind).toBe('scored');
    if (view.kind === 'scored') {
      expect(view.calibration).toBeNull();
    }
  });

  it('appears once today is genuinely the 5th scored result for both her and Root', async () => {
    const service = serviceRoleClient();
    for (let i = 1; i <= MIN_SCORED_FORECASTS_FOR_CALIBRATION - 1; i++) {
      await seedScoredPair(service, addDays(today, -i));
    }
    await service.from('energy_forecasts').insert({
      member_id: memberId,
      forecast_date: today,
      made_from_local_date: addDays(today, -1),
      predicted_energy_level: 3,
    });
    await service.from('root_energy_forecasts').insert({
      member_id: memberId,
      forecast_date: today,
      predicted_energy_level: 3,
      basis_observation_count: 5,
    });

    const view = await buildEndingScreenView(service, memberId, today, makeFakeCheckin(today, 3));
    expect(view.kind).toBe('scored');
    if (view.kind === 'scored') {
      expect(view.calibration).not.toBeNull();
      expect(view.calibration!.scoredCount).toBe(MIN_SCORED_FORECASTS_FOR_CALIBRATION);
      expect(view.calibration!.series.length).toBeGreaterThanOrEqual(3);
    }
  });
});
