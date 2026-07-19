/**
 * Integration coverage for the Coaching Intelligence Engine
 * (lib/coaching-insights/*) against real local Supabase — real RLS, no
 * mocked Supabase client, same philosophy as every other integration
 * suite in this repo. Uses member.two exclusively: unlike member.one,
 * member.two has no seeded check-ins or Food Lens data
 * (supabase/seed/03_assignments_and_data.sql), so this suite's own
 * fixtures are the only data that provider reads will ever see.
 */
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { todaysLocalDate } from '../lib/time/localDate';
import { checkinSourceProvider } from '../lib/coaching-insights/sources/checkinSource';
import { nutritionSourceProvider } from '../lib/coaching-insights/sources/nutritionSource';
import { getCoachingSafetyGate } from '../lib/coaching-insights/safety';
import { getOrGenerateTodaysCoachingInsights } from '../lib/coaching-insights/service';
import {
  insertFoodLensScan,
  insertFoodLensMacroEstimate,
  setManualPrimalPatternProfile,
} from '../lib/food-lens/data';
import { upsertNutritionSafetyFlags } from '../lib/health-safety/store';
import { EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS } from '../lib/health-safety/types';
import type { FoodLensComparisonSignal } from '@mef/shared-types-contracts';

const memberTwo = TEST_USERS.memberTwo;
const TIMEZONE = 'America/Los_Angeles'; // member.two's seeded profile timezone

function shiftDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function submitCheckinAt(
  client: Awaited<ReturnType<typeof signInAs>>,
  localDate: string,
  overrides: Partial<{ digestion_rating: number; energy_level: number; water_cups: number }> = {}
) {
  await client.rpc('submit_daily_checkin', {
    p_timezone: TIMEZONE,
    p_local_date: localDate,
    p_mood_level: 3,
    p_sleep_quality: 3,
    p_sleep_duration: '6-7h',
    p_energy_level: overrides.energy_level ?? 3,
    p_stress_level: 3,
    p_water_cups: overrides.water_cups ?? 5,
    p_digestion_rating: overrides.digestion_rating ?? 3,
    p_pain_discomfort_level: 1,
    p_movement_today: 'light',
    p_new_or_worsening_concern: false,
    p_optional_notes: null,
    p_actual_bedtime: null,
    p_actual_wake_time: null,
    p_night_waking_count: null,
    p_night_sweats: null,
    p_morning_soreness: null,
    p_bowel_movement_status: null,
  });
}

async function insertFoodLensComparisonAt(
  client: Awaited<ReturnType<typeof signInAs>>,
  memberId: string,
  profileId: string,
  createdAtIso: string,
  signals: FoodLensComparisonSignal[]
) {
  const scan = await insertFoodLensScan(client, memberId, 'meal_photo', profileId);
  const macroEstimate = await insertFoodLensMacroEstimate(client, {
    scanId: scan!.id,
    proteinLevel: 'low',
    carbLevel: 'moderate',
    fatLevel: 'moderate',
    proteinConfidence: 0.9,
    carbConfidence: 0.9,
    fatConfidence: 0.9,
    overallConfidence: 0.9,
    basis: 'ai_estimated',
  });
  const { data, error } = await client
    .from('food_lens_pattern_comparisons')
    .insert({
      scan_id: scan!.id,
      macro_estimate_id: macroEstimate!.id,
      primal_pattern_profile_id: profileId,
      signals,
      narrative: 'test fixture',
      confidence: 0.9,
      created_at: createdAtIso,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertFoodLensComparisonAt failed: ${error.message}`);
  return data!.id as string;
}

async function cleanupMemberTwo() {
  const service = serviceRoleClient();
  await service.from('coaching_insights').delete().eq('member_id', memberTwo.id);
  await service.from('daily_checkins').delete().eq('user_id', memberTwo.id);
  await service
    .from('food_lens_pattern_comparisons')
    .delete()
    .in(
      'scan_id',
      (await service.from('food_lens_scans').select('id').eq('member_id', memberTwo.id)).data?.map(
        (r: { id: string }) => r.id
      ) ?? []
    );
  await service
    .from('food_lens_macro_estimates')
    .delete()
    .in(
      'scan_id',
      (await service.from('food_lens_scans').select('id').eq('member_id', memberTwo.id)).data?.map(
        (r: { id: string }) => r.id
      ) ?? []
    );
  await service.from('food_lens_scans').delete().eq('member_id', memberTwo.id);
  await service.from('primal_pattern_profiles').delete().eq('member_id', memberTwo.id);
  await service.from('member_nutrition_safety_flags').delete().eq('member_id', memberTwo.id);
  await service.from('safety_review_queue').delete().eq('member_id', memberTwo.id);
  await service.from('safety_classifications').delete().eq('member_id', memberTwo.id);
}

afterEach(cleanupMemberTwo);
afterAll(cleanupMemberTwo);

describe('checkinSourceProvider (real DB)', () => {
  it('normalizes daily_checkins_current rows into observations with the correct direction', async () => {
    const client = await signInAs(memberTwo);
    const today = todaysLocalDate(TIMEZONE);
    await submitCheckinAt(client, shiftDate(today, -1), { digestion_rating: 2, water_cups: 3 });

    const observations = await checkinSourceProvider.fetchObservations(client, memberTwo.id, {
      from: shiftDate(today, -7),
      to: today,
    });

    const digestion = observations.find((o) => o.metric === 'digestion_rating');
    expect(digestion?.direction).toBe('low');
    const water = observations.find((o) => o.metric === 'water_cups');
    expect(water?.value).toBe(3);
    expect(water?.direction).toBe('neutral'); // relative low/high judged by a level generator, not this source
  });
});

describe('nutritionSourceProvider (real DB)', () => {
  it('reads a real food_lens_pattern_comparisons row and maps each dimension signal to an observation', async () => {
    const client = await signInAs(memberTwo);
    const profile = await setManualPrimalPatternProfile(client, memberTwo.id, {
      patternLabel: 'Test Pattern',
      proteinEmphasis: 'high',
      carbEmphasis: 'low',
      fatEmphasis: 'moderate',
    });
    const today = todaysLocalDate(TIMEZONE);
    const createdAt = new Date().toISOString();
    await insertFoodLensComparisonAt(client, memberTwo.id, profile!.id, createdAt, [
      { dimension: 'protein', mealLevel: 'low', targetLevel: 'high', direction: 'light' },
      { dimension: 'carb', mealLevel: 'low', targetLevel: 'low', direction: 'match' },
      { dimension: 'fat', mealLevel: 'moderate', targetLevel: 'moderate', direction: 'match' },
    ]);

    const observations = await nutritionSourceProvider.fetchObservations(client, memberTwo.id, {
      from: shiftDate(today, -1),
      to: today,
    });

    expect(observations).toHaveLength(3);
    const protein = observations.find((o) => o.metric === 'protein');
    expect(protein?.direction).toBe('low');
    const carb = observations.find((o) => o.metric === 'carb');
    expect(carb?.direction).toBe('neutral'); // 'match' -> 'neutral', a real positive signal, not an absence
  });
});

describe('getCoachingSafetyGate (real DB)', () => {
  it('suppresses nothing for a member with no restrictions and no safety flags', async () => {
    const client = await signInAs(memberTwo);
    const gate = await getCoachingSafetyGate(client, memberTwo.id);
    expect(gate.suppressAll).toBe(false);
    expect(gate.suppressNutrition).toBe(false);
    expect(gate.safetyMessage).toBeNull();
  });

  it('suppresses nutrition-sourced coaching, but not everything, when a health-safety override is active', async () => {
    const client = await signInAs(memberTwo);
    await upsertNutritionSafetyFlags(
      client,
      memberTwo.id,
      { ...EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS, hasDiabetes: true },
      memberTwo.id,
      'member'
    );

    const gate = await getCoachingSafetyGate(client, memberTwo.id);
    expect(gate.suppressAll).toBe(false);
    expect(gate.suppressNutrition).toBe(true);
  });

  it('suppresses everything when the general Coaching Safety System has an open restriction', async () => {
    const client = await signInAs(memberTwo);
    const service = serviceRoleClient();
    const { data: classification } = await service
      .from('safety_classifications')
      .insert({
        member_id: memberTwo.id,
        source_feature: 'daily_checkin',
        classification_level: 'coach_review_required',
        urgency: 'medium',
        coaching_allowed: true,
        coach_review_required: true,
        acknowledgment_required: true,
        escalation_action: 'coach_review_queue',
        policy_version: 'test-v1',
      })
      .select('id')
      .single();
    await service.from('safety_review_queue').insert({
      member_id: memberTwo.id,
      classification_id: classification!.id,
      source_feature: 'daily_checkin',
      classification_level: 'coach_review_required',
      urgency: 'medium',
      status: 'new',
      restrictions_applied: { restrictedTopics: ['nutrition'] },
    });

    const gate = await getCoachingSafetyGate(client, memberTwo.id);
    expect(gate.suppressAll).toBe(true);
    expect(gate.safetyMessage).not.toBeNull();
  });
});

describe('getOrGenerateTodaysCoachingInsights (real DB, end-to-end)', () => {
  it('generates no coaching for a member with no logged data at all', async () => {
    const client = await signInAs(memberTwo);
    const result = await getOrGenerateTodaysCoachingInsights(client, memberTwo.id, TIMEZONE);
    expect(result.insights).toEqual([]);
    expect(result.safetyMessage).toBeNull();
  });

  it('generates a real "Recent Pattern" statement once there is sufficient evidence, and caches it on a second call', async () => {
    const client = await signInAs(memberTwo);
    const today = todaysLocalDate(TIMEZONE);
    // 3 of the last 5 check-ins report low digestion — clears the Level 2 bar.
    await submitCheckinAt(client, shiftDate(today, -4), { digestion_rating: 2 });
    await submitCheckinAt(client, shiftDate(today, -3), { digestion_rating: 2 });
    await submitCheckinAt(client, shiftDate(today, -2), { digestion_rating: 2 });
    await submitCheckinAt(client, shiftDate(today, -1), { digestion_rating: 3 });
    await submitCheckinAt(client, today, { digestion_rating: 3 });

    const first = await getOrGenerateTodaysCoachingInsights(client, memberTwo.id, TIMEZONE);
    const recentPattern = first.insights.find((i) => i.category === 'recent_pattern');
    expect(recentPattern).toBeDefined();
    expect(recentPattern!.statement).toContain('digestion comfort');
    expect(recentPattern!.level).toBe(2);

    const second = await getOrGenerateTodaysCoachingInsights(client, memberTwo.id, TIMEZONE);
    const cachedRecentPattern = second.insights.find((i) => i.category === 'recent_pattern');
    // Same row, not a freshly-generated duplicate — proves the per-day cache hit.
    expect(cachedRecentPattern!.id).toBe(recentPattern!.id);
    expect(cachedRecentPattern!.generated_at).toBe(recentPattern!.generated_at);
  });

  it('stops all coaching and shows the approved safety message when the member has an open restriction', async () => {
    const client = await signInAs(memberTwo);
    const service = serviceRoleClient();
    const today = todaysLocalDate(TIMEZONE);
    await submitCheckinAt(client, shiftDate(today, -4), { digestion_rating: 2 });
    await submitCheckinAt(client, shiftDate(today, -3), { digestion_rating: 2 });
    await submitCheckinAt(client, shiftDate(today, -2), { digestion_rating: 2 });
    await submitCheckinAt(client, shiftDate(today, -1), { digestion_rating: 2 });
    await submitCheckinAt(client, today, { digestion_rating: 2 });

    const { data: classification } = await service
      .from('safety_classifications')
      .insert({
        member_id: memberTwo.id,
        source_feature: 'daily_checkin',
        classification_level: 'coach_review_required',
        urgency: 'medium',
        coaching_allowed: true,
        coach_review_required: true,
        acknowledgment_required: true,
        escalation_action: 'coach_review_queue',
        policy_version: 'test-v1',
      })
      .select('id')
      .single();
    await service.from('safety_review_queue').insert({
      member_id: memberTwo.id,
      classification_id: classification!.id,
      source_feature: 'daily_checkin',
      classification_level: 'coach_review_required',
      urgency: 'medium',
      status: 'new',
      restrictions_applied: { restrictedTopics: ['digestion'] },
    });

    const result = await getOrGenerateTodaysCoachingInsights(client, memberTwo.id, TIMEZONE);
    expect(result.insights).toEqual([]);
    expect(result.safetyMessage).toContain('coaching insights are paused');
  });
});
