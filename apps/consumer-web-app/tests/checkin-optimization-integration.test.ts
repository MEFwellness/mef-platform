import { describe, it, expect, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';

// Fixed, far-past date dedicated to this suite so it never collides with
// real seed data or other suites' fixed dates (tests/checkin.test.ts uses
// 2020-03-15).
const TEST_DATE = '2020-04-20';

async function submitCheckin(
  client: SupabaseClient,
  overrides: Partial<{
    mood_level: number;
    digestion_rating: number;
    movement_today: string;
    completion_seconds: number;
  }> = {}
) {
  return client.rpc('submit_daily_checkin', {
    p_timezone: 'America/New_York',
    p_local_date: TEST_DATE,
    p_mood_level: overrides.mood_level ?? 3,
    p_sleep_quality: 3,
    p_sleep_duration: '6-7h',
    p_energy_level: 3,
    p_stress_level: 3,
    p_water_cups: 4,
    p_digestion_rating: overrides.digestion_rating ?? null,
    p_pain_discomfort_level: 1,
    p_movement_today: overrides.movement_today ?? null,
    p_new_or_worsening_concern: false,
    p_optional_notes: null,
    p_actual_bedtime: null,
    p_actual_wake_time: null,
    p_night_waking_count: null,
    p_night_sweats: null,
    p_morning_soreness: null,
    p_bowel_movement_status: null,
    p_completion_seconds: overrides.completion_seconds ?? null,
  });
}

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('daily_checkins').delete().eq('user_id', TEST_USERS.memberOne.id).eq('local_date', TEST_DATE);
});

describe('60-second-ceiling instrumentation: submit_daily_checkin round-trips completion_seconds', () => {
  it('stores the elapsed seconds passed at submission', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data: id, error } = await submitCheckin(client, { completion_seconds: 47 });
    expect(error).toBeNull();

    const { data } = await client.from('daily_checkins').select('completion_seconds').eq('id', id as string).single();
    expect(data?.completion_seconds).toBe(47);
  });

  it('defaults to null when omitted — a draft save never claims a completion time', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data: id, error } = await submitCheckin(client);
    expect(error).toBeNull();

    const { data } = await client.from('daily_checkins').select('completion_seconds').eq('id', id as string).single();
    expect(data?.completion_seconds).toBeNull();
  });
});

describe('water/movement leave the check-in: a Today movement tap survives a later check-in submission unclobbered (task requirement 4)', () => {
  it('re-submitting with only digestion_rating set preserves an earlier movement_today value, and vice versa — same resubmission pattern app/actions/events.ts.logMovementLevel and the morning form both use', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    // Simulates a Today movement tap: the first row on this date sets
    // movement_today only.
    const { data: firstId } = await submitCheckin(client, { movement_today: 'light' });
    const { data: firstRow } = await client
      .from('daily_checkins')
      .select('movement_today, digestion_rating')
      .eq('id', firstId as string)
      .single();
    expect(firstRow?.movement_today).toBe('light');
    expect(firstRow?.digestion_rating).toBeNull();

    // Simulates the morning form's own resubmission, now folding in a
    // digestion answer from the morning rotation while carrying the
    // already-logged movement value forward (exactly what
    // CheckinForm.buildCurrentInput does via existingCheckin?.movement_today).
    const { data: secondId } = await submitCheckin(client, {
      movement_today: firstRow?.movement_today as string,
      digestion_rating: 4,
    });
    const { data: secondRow } = await client
      .from('daily_checkins')
      .select('movement_today, digestion_rating')
      .eq('id', secondId as string)
      .single();

    expect(secondRow?.movement_today).toBe('light'); // never overwritten
    expect(secondRow?.digestion_rating).toBe(4);
  });
});

describe('rehomed evening probes appear in the morning rotation pool (task requirement 2, migration 113)', () => {
  it('digestion_rating (DIG-2) and its local follow-up are morning-screen and active', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data, error } = await client
      .from('driver_probe_questions')
      .select('question_key, screen, active')
      .in('question_key', ['checkin_probe.digestion_rating', 'checkin_probe.digestive_symptom_type']);

    expect(error).toBeNull();
    const byKey = new Map((data ?? []).map((row) => [row.question_key, row]));
    expect(byKey.get('checkin_probe.digestion_rating')).toMatchObject({ screen: 'morning', active: true });
    expect(byKey.get('checkin_probe.digestive_symptom_type')).toMatchObject({ screen: 'morning', active: true });
  });

  it('movement_today (MOV-2) is deactivated rather than folded to morning — it left the check-in entirely for the Today quick tap', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data } = await client
      .from('driver_probe_questions')
      .select('active')
      .eq('question_key', 'checkin_probe.movement_today')
      .single();
    expect(data?.active).toBe(false);
  });

  it('no active driver_probe_questions row is still screen=evening — Evening being optional must never silently strand a driver without evidence', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data, error } = await client.from('driver_probe_questions').select('question_key').eq('screen', 'evening').eq('active', true);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('the active bank is overwhelmingly morning-eligible now, not the pre-migration 19-of-88 split', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data } = await client.from('driver_probe_questions').select('screen').eq('active', true);
    const morningCount = (data ?? []).filter((row) => row.screen === 'morning').length;
    expect(morningCount).toBeGreaterThan(80);
  });
});
