import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTodaysCheckinPlan } from '../lib/daily-checkin-adaptive/plan';
import { FIXED_CORE_QUESTION_KEYS, MAX_DAILY_QUESTIONS, ROTATING_PROBE_TARGET_COUNT } from '../lib/daily-checkin-adaptive/constants';

type TableResponse = { data: unknown; error: unknown };

/**
 * Minimal fake SupabaseClient — just enough of the query-builder surface
 * (.select/.eq/.order/.limit/.maybeSingle/.upsert, plus being awaitable
 * directly like the real client) for getTodaysCheckinPlan's exact call
 * sequence. Keyed by table name only; every chained filter is a no-op.
 */
function fakeSupabase(responses: Record<string, TableResponse>): SupabaseClient {
  function builder(table: string) {
    const response = responses[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve(response),
      upsert: () => Promise.resolve({ error: response.error ?? null }),
      then: (resolve: (value: TableResponse) => void) => Promise.resolve(response).then(resolve),
    };
    return chain;
  }
  return { from: builder } as unknown as SupabaseClient;
}

const REAL_PROBE_QUESTION_ROWS = [
  {
    question_key: 'checkin_probe.night_waking_count',
    driver_id: 'SLP-2',
    prompt: 'How many times did you wake up during the night?',
    response_type: 'count',
    options: [0, 1, 2, 3, 4, 5],
    storage: 'daily_checkins_column',
    daily_checkins_column: 'night_waking_count',
    wearable_metric_code: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
  },
  {
    question_key: 'checkin_probe.night_sweats',
    driver_id: 'SLP-6',
    prompt: 'Any night sweats?',
    response_type: 'boolean',
    options: [],
    storage: 'daily_checkins_column',
    daily_checkins_column: 'night_sweats',
    wearable_metric_code: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
  },
  {
    question_key: 'checkin_probe.bowel_movement_status',
    driver_id: 'DIG-1',
    prompt: 'Bowel movement status',
    response_type: 'single_select',
    options: ['normal', 'constipated', 'loose', 'none'],
    storage: 'daily_checkins_column',
    daily_checkins_column: 'bowel_movement_status',
    wearable_metric_code: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
  },
  {
    question_key: 'checkin_probe.digestion_rating',
    driver_id: 'DIG-2',
    prompt: 'How was your digestion today?',
    response_type: 'scale',
    options: [1, 2, 3, 4, 5],
    storage: 'daily_checkins_column',
    daily_checkins_column: 'digestion_rating',
    wearable_metric_code: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
  },
  {
    question_key: 'checkin_probe.movement_today',
    driver_id: 'MOV-2',
    prompt: 'How much did you move your body today overall?',
    response_type: 'single_select',
    options: ['none', 'light', 'moderate', 'full_session'],
    storage: 'daily_checkins_column',
    daily_checkins_column: 'movement_today',
    wearable_metric_code: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
  },
  {
    question_key: 'checkin_probe.pain_location',
    driver_id: null,
    prompt: 'Where is it, mainly?',
    response_type: 'single_select',
    options: [],
    storage: 'probe_answer',
    daily_checkins_column: null,
    wearable_metric_code: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
  },
];

function freshComputationResponses(): Record<string, TableResponse> {
  return {
    member_daily_probe_selections: { data: [], error: null },
    driver_probe_questions: { data: REAL_PROBE_QUESTION_ROWS, error: null },
    member_goal_selections: { data: null, error: null },
    driver_goal_weights: { data: [], error: null },
    member_driver_states: { data: [], error: null },
  };
}

describe('getTodaysCheckinPlan — fixed core is never touched by the adaptive layer', () => {
  it('always returns the exact full fixed-core key list, regardless of driver states', async () => {
    const supabase = fakeSupabase(freshComputationResponses());
    const plan = await getTodaysCheckinPlan(supabase, 'member-1', '2026-07-26', () => 0);
    expect(plan.fixedCoreQuestionKeys).toEqual(FIXED_CORE_QUESTION_KEYS);
  });

  it('still returns the full fixed core even when every driver is ruled out (rotating pool empty)', async () => {
    const responses = freshComputationResponses();
    responses.member_driver_states = {
      data: [
        { member_id: 'member-1', driver_id: 'SLP-2', state: 'ruled_out', evidence_summary: {}, updated_at: '2026-07-01T00:00:00.000Z' },
        { member_id: 'member-1', driver_id: 'SLP-6', state: 'ruled_out', evidence_summary: {}, updated_at: '2026-07-01T00:00:00.000Z' },
        { member_id: 'member-1', driver_id: 'DIG-1', state: 'ruled_out', evidence_summary: {}, updated_at: '2026-07-01T00:00:00.000Z' },
        { member_id: 'member-1', driver_id: 'DIG-2', state: 'ruled_out', evidence_summary: {}, updated_at: '2026-07-01T00:00:00.000Z' },
        { member_id: 'member-1', driver_id: 'MOV-2', state: 'ruled_out', evidence_summary: {}, updated_at: '2026-07-01T00:00:00.000Z' },
      ],
      error: null,
    };
    const supabase = fakeSupabase(responses);
    const plan = await getTodaysCheckinPlan(supabase, 'member-1', '2026-07-26', () => 0);
    expect(plan.fixedCoreQuestionKeys).toEqual(FIXED_CORE_QUESTION_KEYS);
    expect(plan.rotatingProbes).toHaveLength(0);
  });

  it('never selects more than ROTATING_PROBE_TARGET_COUNT rotating probes, and the total never exceeds MAX_DAILY_QUESTIONS', async () => {
    const supabase = fakeSupabase(freshComputationResponses());
    const plan = await getTodaysCheckinPlan(supabase, 'member-1', '2026-07-26', () => 0);
    expect(plan.rotatingProbes.length).toBeLessThanOrEqual(ROTATING_PROBE_TARGET_COUNT);
    expect(plan.fixedCoreQuestionKeys.length + plan.rotatingProbes.length).toBeLessThanOrEqual(MAX_DAILY_QUESTIONS);
  });

  it('never includes the local pain follow-up (null driver_id) among the rotating probes', async () => {
    const supabase = fakeSupabase(freshComputationResponses());
    const plan = await getTodaysCheckinPlan(supabase, 'member-1', '2026-07-26', () => 0);
    expect(plan.rotatingProbes.some((p) => p.questionKey === 'checkin_probe.pain_location')).toBe(false);
  });

  it('reconstructs an already-recorded plan for a repeat visit the same day, still with the full fixed core', async () => {
    const responses = freshComputationResponses();
    responses.member_daily_probe_selections = {
      data: [
        { question_key: 'checkin.pain', kind: 'fixed_core' },
        { question_key: 'checkin_probe.digestion_rating', kind: 'rotating_probe' },
      ],
      error: null,
    };
    const supabase = fakeSupabase(responses);
    const plan = await getTodaysCheckinPlan(supabase, 'member-1', '2026-07-26', () => 0);
    expect(plan.fixedCoreQuestionKeys).toEqual(FIXED_CORE_QUESTION_KEYS);
    expect(plan.rotatingProbes.map((p) => p.questionKey)).toEqual(['checkin_probe.digestion_rating']);
  });
});
