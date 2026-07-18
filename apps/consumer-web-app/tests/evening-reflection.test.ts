/**
 * Integration test for the evening_reflections table (migration 63).
 * Confirms the two hard product requirements: it's a genuinely
 * independent table (no dependency on a same-day daily_checkins row
 * existing), and it upserts in place per (member_id, local_date) rather
 * than versioning like daily_checkins does.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';

const TEST_DATE = '2020-06-11';

afterAll(async () => {
  const service = serviceRoleClient();
  await service
    .from('evening_reflections')
    .delete()
    .eq('member_id', TEST_USERS.memberOne.id)
    .eq('local_date', TEST_DATE);
});

describe('evening_reflections', () => {
  it('can be created with no corresponding daily_checkins row for the same date — Evening Reflection never requires Morning Readiness', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const { data: existingCheckin } = await client
      .from('daily_checkins_current')
      .select('id')
      .eq('user_id', TEST_USERS.memberOne.id)
      .eq('local_date', TEST_DATE)
      .maybeSingle();
    expect(existingCheckin).toBeNull(); // confirms this test date has no checkin

    const { data, error } = await client
      .from('evening_reflections')
      .insert({
        member_id: TEST_USERS.memberOne.id,
        timezone: 'America/New_York',
        local_date: TEST_DATE,
        overall_day_rating: 4,
        daytime_stress: 2,
        energy_pattern: 'steady',
        symptoms_or_changes: null,
        recovery: 4,
      })
      .select('*')
      .single();

    expect(error).toBeNull();
    expect(data?.overall_day_rating).toBe(4);
  });

  it('upserts in place on (member_id, local_date) — re-submitting the same day updates rather than duplicating', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await client.from('evening_reflections').upsert(
      {
        member_id: TEST_USERS.memberOne.id,
        timezone: 'America/New_York',
        local_date: TEST_DATE,
        overall_day_rating: 2,
        recovery: 2,
      },
      { onConflict: 'member_id,local_date' }
    );
    await client.from('evening_reflections').upsert(
      {
        member_id: TEST_USERS.memberOne.id,
        timezone: 'America/New_York',
        local_date: TEST_DATE,
        overall_day_rating: 5,
        recovery: 5,
      },
      { onConflict: 'member_id,local_date' }
    );

    const { data, error } = await client
      .from('evening_reflections')
      .select('overall_day_rating, recovery')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('local_date', TEST_DATE);

    expect(error).toBeNull();
    expect(data).toHaveLength(1); // never duplicated
    expect(data?.[0]?.overall_day_rating).toBe(5); // latest write wins
  });

  it('rejects an out-of-range overall_day_rating (check constraint 1-5)', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { error } = await client.from('evening_reflections').insert({
      member_id: TEST_USERS.memberOne.id,
      timezone: 'America/New_York',
      local_date: '2020-06-12',
      overall_day_rating: 10,
    });
    expect(error).not.toBeNull();
  });

  it("a member cannot read another member's evening reflection (RLS)", async () => {
    const memberOne = await signInAs(TEST_USERS.memberOne);
    await memberOne.from('evening_reflections').upsert(
      {
        member_id: TEST_USERS.memberOne.id,
        timezone: 'America/New_York',
        local_date: TEST_DATE,
        overall_day_rating: 3,
      },
      { onConflict: 'member_id,local_date' }
    );

    const memberTwo = await signInAs(TEST_USERS.memberTwo);
    const { data } = await memberTwo
      .from('evening_reflections')
      .select('id')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('local_date', TEST_DATE);

    expect(data ?? []).toHaveLength(0);
  });
});
