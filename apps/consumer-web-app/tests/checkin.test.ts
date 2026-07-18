import { describe, it, expect, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';

// Fixed, far-past date dedicated to this suite so it never collides with
// the "today / yesterday" rows supabase/seed/03_assignments_and_data.sql
// creates for member.one (which manual dashboard verification relies on).
const TEST_DATE = '2020-03-15';

async function submitCheckin(
  client: SupabaseClient,
  overrides: Partial<{
    mood_level: number;
    sleep_quality: number;
    sleep_duration: string;
    energy_level: number;
    stress_level: number;
    water_cups: number;
    digestion_rating: number;
    pain_discomfort_level: number;
    movement_today: string;
    new_or_worsening_concern: boolean;
    optional_notes: string | null;
  }> = {}
) {
  return client.rpc('submit_daily_checkin', {
    p_timezone: 'America/New_York',
    p_local_date: TEST_DATE,
    p_mood_level: overrides.mood_level ?? 3,
    p_sleep_quality: overrides.sleep_quality ?? 3,
    p_sleep_duration: overrides.sleep_duration ?? '6-7h',
    p_energy_level: overrides.energy_level ?? 3,
    p_stress_level: overrides.stress_level ?? 3,
    p_water_cups: overrides.water_cups ?? 4,
    p_digestion_rating: overrides.digestion_rating ?? 3,
    p_pain_discomfort_level: overrides.pain_discomfort_level ?? 1,
    p_movement_today: overrides.movement_today ?? 'light',
    p_new_or_worsening_concern: overrides.new_or_worsening_concern ?? false,
    p_optional_notes: overrides.optional_notes ?? null,
    p_actual_bedtime: null,
    p_actual_wake_time: null,
    p_night_waking_count: null,
    p_night_sweats: null,
    p_morning_soreness: null,
    p_bowel_movement_status: null,
  });
}

afterAll(async () => {
  // Members can't delete their own check-ins (append-only, no DELETE
  // policy) — teardown has to go through the service role.
  const service = serviceRoleClient();
  await service
    .from('daily_checkins')
    .delete()
    .eq('user_id', TEST_USERS.memberOne.id)
    .eq('local_date', TEST_DATE);
});

describe('daily check-ins', () => {
  it('submit_daily_checkin creates a new versioned row', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data: id, error } = await submitCheckin(client, { mood_level: 4 });

    expect(error).toBeNull();
    expect(id).toBeTruthy();

    const { data: row } = await client
      .from('daily_checkins')
      .select('checkin_version, mood_level')
      .eq('id', id as string)
      .single();

    expect(row?.mood_level).toBe(4);
    expect(row?.checkin_version).toBeGreaterThanOrEqual(1);
  });

  it('editing the same local_date increments checkin_version instead of overwriting', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const { data: firstId } = await submitCheckin(client, { mood_level: 2 });
    const { data: firstRow } = await client
      .from('daily_checkins')
      .select('checkin_version')
      .eq('id', firstId as string)
      .single();
    const firstVersion = firstRow!.checkin_version as number;

    const { data: secondId } = await submitCheckin(client, { mood_level: 5 });
    const { data: secondRow } = await client
      .from('daily_checkins')
      .select('checkin_version, edited_at')
      .eq('id', secondId as string)
      .single();

    expect(secondId).not.toBe(firstId);
    expect(secondRow?.checkin_version).toBe(firstVersion + 1);
    expect(secondRow?.edited_at).not.toBeNull(); // only set when version > 1
  });

  it('daily_checkins_current surfaces only the latest version for the date', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await submitCheckin(client, { mood_level: 1, optional_notes: 'stale' });
    await submitCheckin(client, { mood_level: 5, optional_notes: 'latest' });

    const { data, error } = await client
      .from('daily_checkins_current')
      .select('mood_level, optional_notes, checkin_version')
      .eq('local_date', TEST_DATE)
      .single();

    expect(error).toBeNull();
    expect(data?.optional_notes).toBe('latest');
    expect(data?.mood_level).toBe(5);
  });

  it('mood_level and water_cups round-trip correctly (regression: schema-drift fix)', async () => {
    // mood_level/water_cups were added in migration 21 after the app code
    // already referenced them — this pins the fix in place.
    const client = await signInAs(TEST_USERS.memberOne);
    const { data: id, error } = await submitCheckin(client, { mood_level: 4, water_cups: 6 });
    expect(error).toBeNull();

    const { data } = await client
      .from('daily_checkins')
      .select('mood_level, water_cups')
      .eq('id', id as string)
      .single();

    expect(data?.mood_level).toBe(4);
    expect(data?.water_cups).toBe(6);
  });

  it('derives sleep_observation_period_start/end as local_date - 1 / local_date', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data: id } = await submitCheckin(client);

    const { data } = await client
      .from('daily_checkins')
      .select('sleep_observation_period_start, sleep_observation_period_end')
      .eq('id', id as string)
      .single();

    expect(data?.sleep_observation_period_start).toBe('2020-03-14');
    expect(data?.sleep_observation_period_end).toBe(TEST_DATE);
  });

  it('members cannot UPDATE a check-in row directly (append-only enforcement)', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data: id } = await submitCheckin(client, { mood_level: 3 });

    await client
      .from('daily_checkins')
      .update({ mood_level: 99 })
      .eq('id', id as string);

    // No UPDATE policy exists for member on daily_checkins — verify via the
    // service role (bypasses RLS) that the row is genuinely unchanged, not
    // just that our own client failed to see the change.
    const service = serviceRoleClient();
    const { data: actual } = await service
      .from('daily_checkins')
      .select('mood_level')
      .eq('id', id as string)
      .single();
    expect(actual?.mood_level).toBe(3);
  });

  it("a member cannot read another member's check-ins", async () => {
    const memberOne = await signInAs(TEST_USERS.memberOne);
    await submitCheckin(memberOne, { mood_level: 3 });

    const memberTwo = await signInAs(TEST_USERS.memberTwo);
    const { data, error } = await memberTwo
      .from('daily_checkins_current')
      .select('id')
      .eq('user_id', TEST_USERS.memberOne.id)
      .eq('local_date', TEST_DATE);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
