import { describe, it, expect, afterAll } from 'vitest';
import { resolveLocalDate } from '@/app/actions/checkin';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';

const TEST_DATE = '2019-11-01';
const TEST_DATE_2 = '2019-11-02';

afterAll(async () => {
  const service = serviceRoleClient();
  await service
    .from('daily_checkins')
    .delete()
    .eq('user_id', TEST_USERS.memberOne.id)
    .in('local_date', [TEST_DATE, TEST_DATE_2]);
});

describe('resolveLocalDate (pure — no Supabase client, no request scope needed)', () => {
  it('returns the current calendar date in the given timezone', async () => {
    const result = await resolveLocalDate(new Date('2026-01-15T14:30:00'), false);
    expect(result).toBe('2026-01-15');
  });

  it('stays on today when outside the late-checkin grace window, even if requested', async () => {
    // 10:00am is well outside the "within 6 hours of local midnight" window.
    const result = await resolveLocalDate(new Date('2026-01-15T10:00:00'), true);
    expect(result).toBe('2026-01-15');
  });

  it('logs for yesterday when within the 6-hour grace window and requested', async () => {
    // 2:00am is within 6 hours of local midnight.
    const result = await resolveLocalDate(new Date('2026-01-15T02:00:00'), true);
    expect(result).toBe('2026-01-14');
  });

  it('does not roll back to yesterday inside the grace window unless requested', async () => {
    const result = await resolveLocalDate(new Date('2026-01-15T02:00:00'), false);
    expect(result).toBe('2026-01-15');
  });
});

describe('dashboard data loading (same queries app/dashboard/page.tsx and app/actions/checkin.ts issue)', () => {
  it('getTodaysCheckin-equivalent query returns null when nothing is logged for the date', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data, error } = await client
      .from('daily_checkins_current')
      .select('*')
      .eq('user_id', TEST_USERS.memberOne.id)
      .eq('local_date', '1999-01-01') // never seeded, never written by any test
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('returns the logged row once a check-in exists for the date', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await client.rpc('submit_daily_checkin', {
      p_timezone: 'America/New_York',
      p_local_date: TEST_DATE,
      p_mood_level: 3,
      p_sleep_quality: 3,
      p_sleep_duration: '7-8h',
      p_energy_level: 4,
      p_stress_level: 2,
      p_water_cups: 5,
      p_digestion_rating: 3,
      p_pain_discomfort_level: 0,
      p_movement_today: 'moderate',
      p_new_or_worsening_concern: false,
      p_optional_notes: null,
    });

    const { data, error } = await client
      .from('daily_checkins_current')
      .select('*')
      .eq('user_id', TEST_USERS.memberOne.id)
      .eq('local_date', TEST_DATE)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.energy_level).toBe(4);
    expect(data?.water_cups).toBe(5);
  });

  it('getRecentCheckins-equivalent query orders by local_date descending and respects a limit', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await client.rpc('submit_daily_checkin', {
      p_timezone: 'America/New_York',
      p_local_date: TEST_DATE_2,
      p_mood_level: 4,
      p_sleep_quality: 4,
      p_sleep_duration: '7-8h',
      p_energy_level: 4,
      p_stress_level: 1,
      p_water_cups: 6,
      p_digestion_rating: 4,
      p_pain_discomfort_level: 0,
      p_movement_today: 'light',
      p_new_or_worsening_concern: false,
      p_optional_notes: null,
    });

    const { data, error } = await client
      .from('daily_checkins_current')
      .select('local_date')
      .eq('user_id', TEST_USERS.memberOne.id)
      .in('local_date', [TEST_DATE, TEST_DATE_2])
      .order('local_date', { ascending: false })
      .limit(1);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.local_date).toBe(TEST_DATE_2); // the more recent of the two
  });

  it('the profile query the dashboard header uses returns display_name and timezone', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data, error } = await client
      .from('profiles')
      .select('display_name, timezone')
      .eq('id', TEST_USERS.memberOne.id)
      .single();

    expect(error).toBeNull();
    expect(typeof data?.display_name).toBe('string');
    expect(typeof data?.timezone).toBe('string');
  });
});
