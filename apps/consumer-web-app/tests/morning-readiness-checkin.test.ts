/**
 * Integration test for the migration-63 extension of submit_daily_checkin
 * (the Morning Readiness columns: actual_bedtime, actual_wake_time,
 * night_waking_count, night_sweats, morning_soreness,
 * bowel_movement_status). Same real-RLS-and-RPC style as
 * tests/checkin.test.ts, kept in its own file rather than editing that
 * one, focused only on what this migration added.
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';

const TEST_DATE = '2020-05-20';

async function submitMorningReadiness(
  client: SupabaseClient,
  overrides: Partial<{
    actual_bedtime: string | null;
    actual_wake_time: string | null;
    night_waking_count: number | null;
    night_sweats: boolean | null;
    morning_soreness: number | null;
    bowel_movement_status: string | null;
  }> = {}
) {
  return client.rpc('submit_daily_checkin', {
    p_timezone: 'America/New_York',
    p_local_date: TEST_DATE,
    p_mood_level: 3,
    p_sleep_quality: 3,
    p_sleep_duration: '6-7h',
    p_energy_level: 3,
    p_stress_level: 3,
    p_water_cups: 4,
    p_digestion_rating: 3,
    p_pain_discomfort_level: 1,
    p_movement_today: 'light',
    p_new_or_worsening_concern: false,
    p_optional_notes: null,
    p_actual_bedtime: overrides.actual_bedtime ?? '23:00',
    p_actual_wake_time: overrides.actual_wake_time ?? '06:30',
    p_night_waking_count: overrides.night_waking_count ?? 1,
    p_night_sweats: overrides.night_sweats ?? false,
    p_morning_soreness: overrides.morning_soreness ?? 2,
    p_bowel_movement_status: overrides.bowel_movement_status ?? 'normal',
  });
}

afterAll(async () => {
  const service = serviceRoleClient();
  await service
    .from('daily_checkins')
    .delete()
    .eq('user_id', TEST_USERS.memberOne.id)
    .eq('local_date', TEST_DATE);
});

describe('Morning Readiness fields on daily_checkins', () => {
  it('round-trips all six new columns through submit_daily_checkin', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data: id, error } = await submitMorningReadiness(client, {
      actual_bedtime: '22:30',
      actual_wake_time: '06:15',
      night_waking_count: 2,
      night_sweats: true,
      morning_soreness: 4,
      bowel_movement_status: 'constipated',
    });

    expect(error).toBeNull();

    const { data: row } = await client
      .from('daily_checkins')
      .select(
        'actual_bedtime, actual_wake_time, night_waking_count, night_sweats, morning_soreness, bowel_movement_status'
      )
      .eq('id', id as string)
      .single();

    expect(row?.actual_bedtime).toBe('22:30:00');
    expect(row?.actual_wake_time).toBe('06:15:00');
    expect(row?.night_waking_count).toBe(2);
    expect(row?.night_sweats).toBe(true);
    expect(row?.morning_soreness).toBe(4);
    expect(row?.bowel_movement_status).toBe('constipated');
  });

  it('accepts nulls for every new field — a partial morning is still a valid, storable row', async () => {
    const { error } = await submitMorningReadiness(await signInAs(TEST_USERS.memberOne), {
      actual_bedtime: null,
      actual_wake_time: null,
      night_waking_count: null,
      night_sweats: null,
      morning_soreness: null,
      bowel_movement_status: null,
    });
    expect(error).toBeNull();
  });

  it('rejects an out-of-range morning_soreness (check constraint 1-5)', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { error } = await submitMorningReadiness(client, { morning_soreness: 9 });
    expect(error).not.toBeNull();
  });

  it('rejects an invalid bowel_movement_status value (check constraint enum)', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { error } = await submitMorningReadiness(client, { bowel_movement_status: 'invalid_value' });
    expect(error).not.toBeNull();
  });

  it('daily_checkins_current exposes the new columns (view was recreated after the ALTER TABLE)', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await submitMorningReadiness(client, { night_waking_count: 3 });

    const { data, error } = await client
      .from('daily_checkins_current')
      .select('night_waking_count')
      .eq('local_date', TEST_DATE)
      .single();

    expect(error).toBeNull();
    expect(data?.night_waking_count).toBe(3);
  });
});
