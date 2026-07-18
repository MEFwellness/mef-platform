/**
 * Root Score System — integration coverage against real local Supabase:
 * RLS row-level isolation on root_score_snapshots, and the
 * once-per-day upsert behavior lib/scoring/data.ts relies on. Uses a
 * dedicated, far-past date range (2018-06-01 .. 2018-06-10) that no other
 * suite touches, same discipline tests/checkin.test.ts's TEST_DATE already
 * established, and cleans up everything it inserts in afterAll.
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { calculateAndPersistRootScore, getOrCalculateRootScore } from '../lib/scoring/service';
import { getSnapshotForDate } from '../lib/scoring/data';
import { addDaysToLocalDate } from '../lib/feed/dateMath';

const TIMEZONE = 'America/New_York';
const START_DATE = '2018-06-01';
const LAST_DATE = addDaysToLocalDate(START_DATE, 9); // 10 days total

async function submitCheckin(client: SupabaseClient, localDate: string) {
  const { error } = await client.rpc('submit_daily_checkin', {
    p_timezone: TIMEZONE,
    p_local_date: localDate,
    p_mood_level: 4,
    p_sleep_quality: 4,
    p_sleep_duration: '7-8h',
    p_energy_level: 4,
    p_stress_level: 2,
    p_water_cups: 6,
    p_digestion_rating: 4,
    p_pain_discomfort_level: 0,
    p_movement_today: 'moderate',
    p_new_or_worsening_concern: false,
    p_optional_notes: null,
    p_actual_bedtime: null,
    p_actual_wake_time: null,
    p_night_waking_count: null,
    p_night_sweats: null,
    p_morning_soreness: null,
    p_bowel_movement_status: null,
  });
  if (error) throw new Error(`submitCheckin(${localDate}) failed: ${error.message}`);
}

describe('Root Score System — persistence + isolation', () => {
  afterAll(async () => {
    const service = serviceRoleClient();
    await service.from('root_score_snapshots').delete().eq('member_id', TEST_USERS.memberOne.id).gte('local_date', START_DATE).lte('local_date', LAST_DATE);
    await service.from('daily_checkins').delete().eq('user_id', TEST_USERS.memberOne.id).gte('local_date', START_DATE).lte('local_date', LAST_DATE);
  });

  it('calculates and persists a real snapshot from real check-in history, and upserts (not duplicates) on recalculation', async () => {
    const memberOne = await signInAs(TEST_USERS.memberOne);

    for (let i = 0; i < 10; i++) {
      await submitCheckin(memberOne, addDaysToLocalDate(START_DATE, i));
    }

    const first = await calculateAndPersistRootScore(memberOne, TEST_USERS.memberOne.id, {
      localDate: LAST_DATE,
      timezone: TIMEZONE,
    });
    expect(first).not.toBeNull();
    expect(first!.member_id).toBe(TEST_USERS.memberOne.id);
    expect(first!.local_date).toBe(LAST_DATE);
    expect(first!.root_score).not.toBeNull();
    expect(first!.domain_scores.length).toBe(5);

    const second = await calculateAndPersistRootScore(memberOne, TEST_USERS.memberOne.id, {
      localDate: LAST_DATE,
      timezone: TIMEZONE,
    });
    expect(second!.id).toBe(first!.id); // same row, upserted — not a duplicate

    const service = serviceRoleClient();
    const { count } = await service
      .from('root_score_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('local_date', LAST_DATE);
    expect(count).toBe(1);
  });

  it('getOrCalculateRootScore reuses today\'s snapshot instead of recalculating on a second call', async () => {
    const memberOne = await signInAs(TEST_USERS.memberOne);
    const first = await getOrCalculateRootScore(memberOne, TEST_USERS.memberOne.id, {
      localDate: LAST_DATE,
      timezone: TIMEZONE,
    });
    const second = await getOrCalculateRootScore(memberOne, TEST_USERS.memberOne.id, {
      localDate: LAST_DATE,
      timezone: TIMEZONE,
    });
    expect(second!.calculated_at).toBe(first!.calculated_at); // no recompute happened
  });

  it('a member can never read another member\'s Root Score snapshot (RLS)', async () => {
    const memberTwo = await signInAs(TEST_USERS.memberTwo);

    const direct = await memberTwo
      .from('root_score_snapshots')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('local_date', LAST_DATE);
    expect(direct.data ?? []).toHaveLength(0);

    const viaService = await getSnapshotForDate(memberTwo, TEST_USERS.memberOne.id, LAST_DATE);
    expect(viaService).toBeNull();
  });

  it('a member cannot insert a Root Score snapshot for another member (RLS insert check)', async () => {
    const memberTwo = await signInAs(TEST_USERS.memberTwo);
    const { error } = await memberTwo.from('root_score_snapshots').insert({
      member_id: TEST_USERS.memberOne.id,
      local_date: addDaysToLocalDate(LAST_DATE, 1),
      timezone: TIMEZONE,
      explanation_summary: 'forged',
    });
    expect(error).not.toBeNull();
  });
});
