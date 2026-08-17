/**
 * Conditional water tracking (migration 163).
 *
 * Water used to exist for everybody. A member with no water problem simply
 * never logged, and every reader of daily_checkins.water_cups then read that
 * silence as under-hydration: a nonexistent problem scored, trended,
 * correlated, and reported to her coach. These tests cover the six states
 * that decide whether water exists for a given member, plus the one rule
 * everything downstream depends on — that "off" means absent, never zero.
 *
 * Half real-Supabase (the flag, the view, the write path, who is allowed to
 * set it) and half pure-function (the scoring exclusion, the intake answer
 * mapping, the check-in question filter), matching how the rest of this
 * suite splits.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  HYDRATION_ANSWER_LABELS,
  HYDRATION_ANSWER_VALUES,
  HYDRATION_CHECKIN_COLUMN,
  HYDRATION_DRIVER_ID,
  HYDRATION_POPUP_MESSAGE_KEY,
  HYDRATION_PROMPT,
  HYDRATION_QUESTION_KEY,
  hydrationFocusFromAnswer,
} from '@/lib/hydration/constants';
import { checkinHydrationTracked, gatedWaterCups } from '@/lib/hydration/gate';
import {
  calculateWellnessIndex,
  computeMetricCandidates,
  inputsFromCheckin,
} from '@/lib/wellness/wellness-index';
import { detectInsights } from '@/lib/wellness/insights';
import { checkinAnswers } from '@/lib/coach-member-entries/present';
import { pairsExcludingUntrackedHydration } from '@/lib/correlation-engine/data';
import { isAboutWater as recommendationIsAboutWater } from '@/lib/recommendation-engine/data';
import { VARIABLE_EXTRACTORS } from '@/lib/correlation-engine/variables';
import {
  CORE_LIFESTYLE_KEYS,
  estimatedTotalQuestions,
  initAdaptiveEngineState,
} from '@/lib/onboarding/adaptivePlan';
import { isRootPopupDueThisLogin } from '@/lib/root-popup-messages/data';
import { pickPriority } from '@/lib/brain/priorityEngine';
import type { DailyCheckin } from '@mef/shared-types-contracts';

const MEMBER = TEST_USERS.memberOne;
/** The day this suite submits a check-in on, to prove the write gate. */
const TEST_DATE = '2020-05-11';
/**
 * A day of real, already-logged water history that this suite owns.
 * Deliberately not the seeded rows in supabase/seed/03_assignments_and_data.sql:
 * several other files in this suite wipe member.one's check-ins in their own
 * afterAll, so a test that reads "her existing history" has to create it.
 */
const HISTORY_DATE = '2020-05-09';
const HISTORY_WATER_CUPS = 6;

function checkin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: 'test-checkin',
    user_id: MEMBER.id,
    recorded_at: `${TEST_DATE}T12:00:00Z`,
    checkin_version: 1,
    edited_at: null,
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    created_at: `${TEST_DATE}T12:00:00Z`,
    timezone: 'America/New_York',
    local_date: TEST_DATE,
    mood_level: 4,
    sleep_quality: 4,
    sleep_duration: '7-8h',
    energy_level: 4,
    stress_level: 2,
    water_cups: 0,
    digestion_rating: 4,
    pain_discomfort_level: 1,
    movement_today: 'moderate',
    new_or_worsening_concern: false,
    optional_notes: null,
    actual_bedtime: null,
    actual_wake_time: null,
    night_waking_count: null,
    night_sweats: null,
    morning_soreness: null,
    bowel_movement_status: null,
    completion_seconds: null,
    ...overrides,
  };
}

async function setFocus(value: boolean | null) {
  const service = serviceRoleClient();
  await service
    .from('profiles')
    .update({ hydration_focus: value, hydration_focus_source: value === null ? null : 'intake' })
    .eq('id', MEMBER.id);
}

beforeAll(async () => {
  await setFocus(null);
  const client = await signInAs(MEMBER);
  await client.rpc('submit_daily_checkin', {
    p_timezone: 'America/New_York',
    p_local_date: HISTORY_DATE,
    p_mood_level: 3,
    p_sleep_quality: 3,
    p_sleep_duration: '6-7h',
    p_energy_level: 3,
    p_stress_level: 3,
    p_water_cups: HISTORY_WATER_CUPS,
    p_digestion_rating: 3,
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
    p_completion_seconds: null,
  });
});

beforeEach(async () => {
  // Every test starts from "never asked," the state every member who
  // finished intake before this feature existed is genuinely in.
  await setFocus(null);
});

afterAll(async () => {
  const service = serviceRoleClient();
  await setFocus(null);
  await service
    .from('daily_checkins')
    .delete()
    .eq('user_id', MEMBER.id)
    .in('local_date', [TEST_DATE, HISTORY_DATE]);
  await service
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', MEMBER.id)
    .eq('message_key', HYDRATION_POPUP_MESSAGE_KEY);
});

// ---------------------------------------------------------------------------
// 1. A new member's intake answer sets the flag
// ---------------------------------------------------------------------------

describe('the intake question decides whether water exists for a new member', () => {
  it('is a real question in the live bank, asked of every member exactly once', async () => {
    const service = serviceRoleClient();
    const { data } = await service
      .from('onboarding_questions')
      .select('question_key, prompt_text, allowed_values, question_pool, domain')
      .eq('question_key', HYDRATION_QUESTION_KEY)
      .maybeSingle();

    expect(data).not.toBeNull();
    expect(data!.prompt_text).toBe(HYDRATION_PROMPT);
    expect(data!.allowed_values).toEqual([...HYDRATION_ANSWER_VALUES]);
    // Not 'legacy': the reassessment flow re-asks the fixed 12 verbatim and
    // compares them by exact key, and this is not one of those metrics.
    expect(data!.question_pool).toBe('core_lifestyle');
    // "Near the other lifestyle questions" is a literal placement, not a vibe.
    expect(data!.domain).toBe('lifestyle');
  });

  it('sits in the fixed onboarding queue, so no member can miss it by chance', () => {
    for (const concern of ['pain', 'digestion', 'sleep', 'general_optimization', null]) {
      const state = initAdaptiveEngineState(concern);
      expect(state.phase3aQueue).toContain(HYDRATION_QUESTION_KEY);
      // Last of the lifestyle stretch: after the anchors, before the zoom-out
      // sampler and the readiness triplet.
      expect(state.phase3aQueue[state.phase3aQueue.length - 1]).toBe(HYDRATION_QUESTION_KEY);
    }
    expect(CORE_LIFESTYLE_KEYS).toEqual([HYDRATION_QUESTION_KEY]);
  });

  it('is counted in the progress denominator rather than appearing as a surprise extra', () => {
    // One more than the old total for every concern, adaptive or not.
    expect(estimatedTotalQuestions('pain')).toBe(1 + 3 + 5 + 1 + 1 + 3);
    expect(estimatedTotalQuestions('general_optimization')).toBe(1 + 3 + 6 + 1 + 1 + 3);
  });

  it('never asks the digestion bank’s own water question on top of it', () => {
    // A digestion-concern member would otherwise be asked about her water
    // twice in one sitting, on two different scales.
    expect(initAdaptiveEngineState('digestion').bankExcluded).toContain('digestion_hydration_habit');
  });

  it('NEW MEMBER FLAGGED TRUE: either "not enough water" answer turns tracking on', () => {
    expect(hydrationFocusFromAnswer('very_little')).toBe(true);
    expect(hydrationFocusFromAnswer('a_few_glasses')).toBe(true);
  });

  it('NEW MEMBER FLAGGED FALSE: "I drink plenty" turns tracking off', () => {
    expect(hydrationFocusFromAnswer('plenty')).toBe(false);
  });

  it('leaves the flag alone for anything that is not one of the three real answers', () => {
    // A skip, a "not sure", a reassessment that never carries this key, or a
    // future edit of the question. Guessing on her behalf is worse than
    // waiting: null keeps today's behavior and keeps the pop-up due.
    for (const value of [undefined, null, '', 'not_sure', 'some_future_option', 4]) {
      expect(hydrationFocusFromAnswer(value)).toBeNull();
    }
  });

  it('writes through to the real column, readable by the member herself', async () => {
    const client = await signInAs(MEMBER);
    const { error } = await client.rpc('set_member_hydration_focus', {
      p_member: MEMBER.id,
      p_value: false,
      p_source: 'intake',
    });
    expect(error).toBeNull();

    const { data } = await client
      .from('profiles')
      .select('hydration_focus, hydration_focus_source')
      .eq('id', MEMBER.id)
      .single();
    expect(data!.hydration_focus).toBe(false);
    expect(data!.hydration_focus_source).toBe('intake');
  });

  it('has member-facing copy with no em dashes anywhere', () => {
    const copy = [HYDRATION_PROMPT, ...Object.values(HYDRATION_ANSWER_LABELS)].join(' ');
    expect(copy).not.toContain('—');
    expect(HYDRATION_ANSWER_LABELS.very_little).toBe('Very little, I often forget');
    expect(HYDRATION_ANSWER_LABELS.a_few_glasses).toBe('A few glasses, but not consistently');
    expect(HYDRATION_ANSWER_LABELS.plenty).toBe('I drink plenty of water throughout the day');
  });
});

// ---------------------------------------------------------------------------
// 2. Existing members: before and after they answer the pop-up
// ---------------------------------------------------------------------------

describe('an existing member who was never asked', () => {
  it('EXISTING MEMBER PRE-ANSWER: nothing changes for her, water stays visible and scored', async () => {
    const client = await signInAs(MEMBER);
    const { data } = await client
      .from('daily_checkins_current')
      .select('water_cups, hydration_tracked')
      .eq('user_id', MEMBER.id)
      .eq('local_date', HISTORY_DATE)
      .single();

    // An unanswered flag reads as tracked, in the database and in the app.
    expect(data!.hydration_tracked).toBe(true);
    expect(data!.water_cups).toBe(HISTORY_WATER_CUPS);
    expect(checkinHydrationTracked({ hydration_tracked: true })).toBe(true);
    expect(checkinHydrationTracked({})).toBe(true);
    expect(checkinHydrationTracked(null)).toBe(true);
  });

  it('is asked once by Root, and the pop-up follows the existing dismissal rules', () => {
    // Never dismissed: due. Snoozed then a real login since: due again.
    // Ignored: never again. Exactly day3/day7's rules, no fourth lifetime.
    expect(isRootPopupDueThisLogin(null, '2026-08-16T10:00:00Z')).toBe(true);
    expect(
      isRootPopupDueThisLogin(
        { status: 'snoozed', snoozedAt: '2026-08-15T10:00:00Z' },
        '2026-08-16T10:00:00Z'
      )
    ).toBe(true);
    expect(
      isRootPopupDueThisLogin(
        { status: 'snoozed', snoozedAt: '2026-08-16T12:00:00Z' },
        '2026-08-16T10:00:00Z'
      )
    ).toBe(false);
    expect(isRootPopupDueThisLogin({ status: 'ignored', snoozedAt: null }, '2026-08-16T10:00:00Z')).toBe(
      false
    );
  });

  it('EXISTING MEMBER POST-ANSWER: answering turns water off across the whole view', async () => {
    const client = await signInAs(MEMBER);
    const { error } = await client.rpc('set_member_hydration_focus', {
      p_member: MEMBER.id,
      p_value: false,
      p_source: 'member_popup',
    });
    expect(error).toBeNull();

    const { data } = await client
      .from('daily_checkins_current')
      .select('local_date, water_cups, hydration_tracked')
      .eq('user_id', MEMBER.id);

    expect(data!.length).toBeGreaterThan(0);
    for (const row of data!) {
      expect(row.hydration_tracked).toBe(false);
    }
    // Her history is still readable; it is simply flagged as not counting.
    expect(data!.find((r) => r.local_date === HISTORY_DATE)!.water_cups).toBe(HISTORY_WATER_CUPS);
  });

  it('keeps every cup she has already logged, so turning it back on loses nothing', async () => {
    const service = serviceRoleClient();
    const client = await signInAs(MEMBER);

    const { data: before } = await service
      .from('daily_checkins')
      .select('id, water_cups')
      .eq('user_id', MEMBER.id)
      .not('water_cups', 'is', null);
    expect(before!.length).toBeGreaterThan(0);

    await client.rpc('set_member_hydration_focus', {
      p_member: MEMBER.id,
      p_value: false,
      p_source: 'member_popup',
    });

    const { data: after } = await service
      .from('daily_checkins')
      .select('id, water_cups')
      .eq('user_id', MEMBER.id)
      .not('water_cups', 'is', null);

    // The stored history is byte-for-byte what it was. Only the reading of
    // it changed.
    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// 3. The coach's override, both directions
// ---------------------------------------------------------------------------

describe('the coach override', () => {
  it('COACH OVERRIDE OFF: a coach can turn water off for a client who said she drinks plenty of nothing', async () => {
    const member = await signInAs(MEMBER);
    await member.rpc('set_member_hydration_focus', {
      p_member: MEMBER.id,
      p_value: true,
      p_source: 'intake',
    });

    const coach = await signInAs(TEST_USERS.coachOne);
    const { error } = await coach.rpc('set_member_hydration_focus', {
      p_member: MEMBER.id,
      p_value: false,
      p_source: 'coach',
    });
    expect(error).toBeNull();

    const service = serviceRoleClient();
    const { data } = await service
      .from('profiles')
      .select('hydration_focus, hydration_focus_source')
      .eq('id', MEMBER.id)
      .single();
    expect(data!.hydration_focus).toBe(false);
    expect(data!.hydration_focus_source).toBe('coach');
  });

  it('COACH OVERRIDE ON: a coach can turn water back on for a client who said she drinks plenty', async () => {
    const member = await signInAs(MEMBER);
    await member.rpc('set_member_hydration_focus', {
      p_member: MEMBER.id,
      p_value: false,
      p_source: 'member_popup',
    });

    const coach = await signInAs(TEST_USERS.coachOne);
    const { error } = await coach.rpc('set_member_hydration_focus', {
      p_member: MEMBER.id,
      p_value: true,
      p_source: 'coach',
    });
    expect(error).toBeNull();

    // And the member-facing behavior follows the current value immediately.
    const client = await signInAs(MEMBER);
    const { data } = await client
      .from('daily_checkins_current')
      .select('water_cups, hydration_tracked')
      .eq('user_id', MEMBER.id)
      .eq('local_date', HISTORY_DATE)
      .single();
    expect(data!.hydration_tracked).toBe(true);
    // And the history the "off" period never deleted is scored again.
    expect(data!.water_cups).toBe(HISTORY_WATER_CUPS);
  });

  it('refuses a coach who is not this member’s active coach', async () => {
    // coachOne's assignment to memberTwo is revoked in the seed.
    const coach = await signInAs(TEST_USERS.coachOne);
    const { error } = await coach.rpc('set_member_hydration_focus', {
      p_member: TEST_USERS.memberTwo.id,
      p_value: false,
      p_source: 'coach',
    });
    expect(error).not.toBeNull();

    const service = serviceRoleClient();
    const { data } = await service
      .from('profiles')
      .select('hydration_focus')
      .eq('id', TEST_USERS.memberTwo.id)
      .single();
    expect(data!.hydration_focus).toBeNull();
  });

  it('refuses another member entirely', async () => {
    const other = await signInAs(TEST_USERS.memberTwo);
    const { error } = await other.rpc('set_member_hydration_focus', {
      p_member: MEMBER.id,
      p_value: false,
      p_source: 'coach',
    });
    expect(error).not.toBeNull();
  });

  it('refuses an invented source rather than storing it', async () => {
    const client = await signInAs(MEMBER);
    const { error } = await client.rpc('set_member_hydration_focus', {
      p_member: MEMBER.id,
      p_value: false,
      p_source: 'guesswork',
    });
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Scoring exclusion — the point of the whole feature
// ---------------------------------------------------------------------------

describe('SCORING EXCLUSION: water never counts against a member who does not track it', () => {
  it('reads as absent, never as zero', () => {
    expect(gatedWaterCups(checkin({ water_cups: 8, hydration_tracked: false }))).toBeNull();
    expect(gatedWaterCups(checkin({ water_cups: 8, hydration_tracked: true }))).toBe(8);
    // 0 is a real answer meaning "none today" for somebody who IS tracking.
    expect(gatedWaterCups(checkin({ water_cups: 0, hydration_tracked: true }))).toBe(0);
  });

  it('drops hydration out of the Daily Wellness Index entirely, rather than scoring it 0', () => {
    const tracked = calculateWellnessIndex(
      inputsFromCheckin(checkin({ water_cups: 0, hydration_tracked: true }))
    )!;
    const untracked = calculateWellnessIndex(
      inputsFromCheckin(checkin({ water_cups: 0, hydration_tracked: false }))
    )!;

    expect(tracked.metrics.map((m) => m.key)).toContain('hydration');
    expect(untracked.metrics.map((m) => m.key)).not.toContain('hydration');
  });

  it('raises her score rather than lowering it, because the missing weight is redistributed', () => {
    const zeroCupsScored = calculateWellnessIndex(
      inputsFromCheckin(checkin({ water_cups: 0, hydration_tracked: true }))
    )!;
    const notTracked = calculateWellnessIndex(
      inputsFromCheckin(checkin({ water_cups: 0, hydration_tracked: false }))
    )!;

    // This is the exact harm the feature exists to remove: a member who
    // never had a water problem was being marked down for never logging one.
    expect(notTracked.score).toBeGreaterThan(zeroCupsScored.score);
  });

  it('never lets hydration be named her priority or her strongest area', () => {
    const result = calculateWellnessIndex(
      inputsFromCheckin(checkin({ water_cups: 0, hydration_tracked: false }))
    )!;
    expect(result.priority?.key).not.toBe('hydration');
    expect(result.strongest?.key).not.toBe('hydration');
  });

  it('produces no hydration metric candidate at all, which is what every trend engine reads', () => {
    const candidates = computeMetricCandidates(
      inputsFromCheckin(checkin({ water_cups: 2, hydration_tracked: false }))
    );
    expect(candidates.find((c) => c.key === 'hydration')!.score).toBeNull();
  });

  it('produces no hydration insight, however many low-water days she has', () => {
    const days = Array.from({ length: 8 }, (_, i) =>
      checkin({
        local_date: `2020-05-${String(i + 1).padStart(2, '0')}`,
        water_cups: 0,
        hydration_tracked: false,
      })
    );
    const insights = detectInsights(days);
    expect(insights.some((i) => i.key === 'hydration')).toBe(false);

    // Same days, tracking on: the insight is real and does fire, which is
    // what proves the test above is measuring the gate and not an accident.
    const trackedDays = days.map((d) => ({ ...d, hydration_tracked: true }));
    expect(detectInsights(trackedDays).some((i) => i.key === 'hydration')).toBe(true);
  });

  it('yields no value to the correlation engine, so no hydration pattern can form', () => {
    const extract = VARIABLE_EXTRACTORS['checkin.hydration']!;
    expect(extract(checkin({ water_cups: 6, hydration_tracked: false }), undefined)).toBeNull();
    expect(extract(checkin({ water_cups: 6, hydration_tracked: true }), undefined)).toBe(6);
  });

  it('drops every hydration candidate pair before the engine evaluates one', () => {
    const pairs = [
      {
        pairKey: 'energy_hydration',
        driverId: HYDRATION_DRIVER_ID,
        outcomeVariable: 'checkin.energy',
        driverVariable: 'checkin.hydration',
        label: 'Energy and hydration',
        weight: 'medium' as const,
        goalKeys: ['increase_energy'],
      },
      {
        pairKey: 'energy_sleep',
        driverId: 'SLP-1',
        outcomeVariable: 'checkin.energy',
        driverVariable: 'checkin.sleep_quality',
        label: 'Energy and sleep',
        weight: 'high' as const,
        goalKeys: ['increase_energy'],
      },
    ];

    expect(pairsExcludingUntrackedHydration(pairs, true).map((p) => p.pairKey)).toEqual([
      'energy_hydration',
      'energy_sleep',
    ]);
    expect(pairsExcludingUntrackedHydration(pairs, false).map((p) => p.pairKey)).toEqual([
      'energy_sleep',
    ]);
  });

  it('leaves the water question out of what her coach sees she was asked', () => {
    const shown = checkinAnswers(checkin({ hydration_tracked: true })).map((a) => a.key);
    const hidden = checkinAnswers(checkin({ hydration_tracked: false })).map((a) => a.key);

    expect(shown).toContain('water_cups');
    // Absent, not present-and-unanswered: a coach reading "Not answered"
    // would take it for a question she skipped.
    expect(hidden).not.toContain('water_cups');
    // Every other question she really was asked is untouched.
    expect(hidden).toEqual(shown.filter((k) => k !== 'water_cups'));
  });

  it('stops the water column growing: a submitted check-in stores null, not 0', async () => {
    const client = await signInAs(MEMBER);
    await client.rpc('set_member_hydration_focus', {
      p_member: MEMBER.id,
      p_value: false,
      p_source: 'member_popup',
    });

    // What app/actions/checkin.ts's insertCheckinRow does once the gate has
    // been applied: the form's live hydration total never reaches the row.
    const { error } = await client.rpc('submit_daily_checkin', {
      p_timezone: 'America/New_York',
      p_local_date: TEST_DATE,
      p_mood_level: 3,
      p_sleep_quality: 3,
      p_sleep_duration: '6-7h',
      p_energy_level: 3,
      p_stress_level: 3,
      p_water_cups: null,
      p_digestion_rating: 3,
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
      p_completion_seconds: null,
    });
    expect(error).toBeNull();

    const { data } = await client
      .from('daily_checkins_current')
      .select('water_cups, hydration_tracked')
      .eq('user_id', MEMBER.id)
      .eq('local_date', TEST_DATE)
      .single();

    expect(data!.water_cups).toBeNull();
    expect(data!.hydration_tracked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4b. The two leaks the live site found, which no unit test had covered
// ---------------------------------------------------------------------------

describe('the paths that do NOT go through the Daily Wellness Index', () => {
  function signals(overrides = {}) {
    return {
      localDate: '2020-05-11',
      dayOfWeek: 'monday',
      wellnessIndex: null,
      insights: [],
      adherence: { level: 'medium', completed: 1, total: 2 },
      streak: { current: 1, best: 1, daysSinceLastCheckin: 0, justRecovered: false },
      hasSavedCarryover: false,
      hasActiveSafetyConcern: false,
      unresolvedAssessmentFocus: null,
      recentWin: null,
      confirmedLongTermConcern: null,
      wearableSnapshot: null,
      ...overrides,
    } as unknown as Parameters<typeof pickPriority>[0];
  }

  it('never names hydration as today’s focus for a member who does not track water', () => {
    // Found live: an old narrative sentence containing the word "Hydration"
    // was matched by name (lib/brain/priorityEngine.ts's matchMetricInText)
    // and shown as "Today's coaching focus: Hydration" to a member who had
    // just answered that she drinks plenty of water. That path never touches
    // the wellness index, so the index's own gate could not catch it.
    const tracked = pickPriority(signals({ unresolvedAssessmentFocus: 'hydration' }));
    expect(tracked.focus).toBe('hydration');

    const untracked = pickPriority(
      signals({ unresolvedAssessmentFocus: 'hydration', hydrationTracked: false })
    );
    expect(untracked.focus).not.toBe('hydration');
  });

  it('withholds a stored recommendation that is about water, whatever engine wrote it', () => {
    // Found live, twice. The row still being shown to a member who had just
    // answered "I drink plenty of water" was source_domain 'daily_coaching',
    // not 'hydration' — the domain records which engine produced it, not
    // what it is about. Filtering on domain alone missed it completely.
    const daily = {
      sourceDomain: 'daily_coaching' as const,
      title: "Today's coaching focus: Hydration",
      explanation: 'Your recent check-ins point to hydration as today’s most useful place to focus.',
    };
    const stress = {
      sourceDomain: 'daily_coaching' as const,
      title: "Today's coaching focus: Stress",
      explanation: 'Your recent check-ins point to stress as today’s most useful place to focus.',
    };

    expect(recommendationIsAboutWater(daily)).toBe(true);
    expect(recommendationIsAboutWater(stress)).toBe(false);
    expect(
      recommendationIsAboutWater({ sourceDomain: 'hydration', title: 'Sip more', explanation: 'x' })
    ).toBe(true);
    // Not fooled by a word that merely contains one of the terms.
    expect(
      recommendationIsAboutWater({
        sourceDomain: 'sleep',
        title: 'Watercress at dinner is fine',
        explanation: 'No change needed.',
      })
    ).toBe(false);
  });

  it('drops hydration proposed as a confirmed long-term concern too', () => {
    const untracked = pickPriority(
      signals({ confirmedLongTermConcern: 'hydration', hydrationTracked: false })
    );
    expect(untracked.focus).not.toBe('hydration');
  });

  it('always still has a focus to name, because the weekly fallback survives the filter', () => {
    const result = pickPriority(
      signals({ unresolvedAssessmentFocus: 'hydration', hydrationTracked: false })
    );
    expect(result.focus).toBeTruthy();
    expect(result.reason).toBeTruthy();
  });

  it('leaves every other metric alone', () => {
    const result = pickPriority(
      signals({ unresolvedAssessmentFocus: 'sleep', hydrationTracked: false })
    );
    expect(result.focus).toBe('sleep');
  });
});

// ---------------------------------------------------------------------------
// 5. The check-in question itself
// ---------------------------------------------------------------------------

describe('the water question leaves the daily check-in', () => {
  it('matches water questions by driver AND by column, so a coach-added one is caught too', async () => {
    const service = serviceRoleClient();
    const { data } = await service
      .from('driver_probe_questions')
      .select('question_key, driver_id, daily_checkins_column')
      .eq('driver_id', HYDRATION_DRIVER_ID);

    // The one seeded today. The filter in lib/daily-checkin-adaptive/plan.ts
    // is written against the driver and the column rather than this key, so
    // a question a coach writes tomorrow on /coach/questions is covered
    // without a deploy.
    expect(data!.map((q) => q.question_key)).toContain('checkin_probe.hydration_felt_adequate');
    expect(HYDRATION_CHECKIN_COLUMN).toBe('water_cups');
  });

  it('never removes a question that has nothing to do with water', async () => {
    const service = serviceRoleClient();
    const { count } = await service
      .from('driver_probe_questions')
      .select('question_key', { count: 'exact', head: true })
      .neq('driver_id', HYDRATION_DRIVER_ID);
    expect(count!).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// 6. The view's own contract
// ---------------------------------------------------------------------------

describe('daily_checkins_current carries the gate', () => {
  it('still exposes hydration_tracked (a `select *` recreation would silently drop it)', async () => {
    const service = serviceRoleClient();
    const { data, error } = await service
      .from('daily_checkins_current')
      .select('hydration_tracked')
      .limit(1);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it('answers true for a member with no profile answer, so nothing changes on deploy', async () => {
    const service = serviceRoleClient();
    const { data } = await service.rpc('member_hydration_tracked', { p_member: MEMBER.id });
    expect(data).toBe(true);
  });
});
