import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTodaysCheckinPlan } from '../lib/daily-checkin-adaptive/plan';
import { ROTATING_PROBE_TARGET_COUNT } from '../lib/daily-checkin-adaptive/constants';

/**
 * 60-second-ceiling pass, task requirement 3's own explicit ask: "verify
 * that reducing the daily count does not reduce bank coverage over a
 * 30-day window — questions should still cycle through, just spread
 * thinner per day." Simulates 30 consecutive real calls to
 * getTodaysCheckinPlan (the exact function both check-in pages call)
 * against a large, otherwise-undifferentiated 90-question bank, with a
 * stateful fake member_daily_probe_selections table so each day's
 * recency weighting genuinely reflects what earlier simulated days
 * picked — not a fresh, memoryless bank every time.
 */

const BANK_SIZE = 90;

type PlanRow = { member_id: string; local_date: string; question_key: string; kind: string };

/** A tiny, deterministic PRNG (mulberry32) so the simulation is reproducible across runs rather than flaky. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildQuestionRows() {
  return Array.from({ length: BANK_SIZE }, (_, i) => ({
    question_key: `checkin_probe.sim_${i}`,
    driver_id: `SIM-${i}`, // one unique driver per question, so none get excluded as duplicates of a shared driver
    prompt: `Simulated question ${i}?`,
    response_type: 'boolean',
    options: [],
    storage: 'probe_answer',
    daily_checkins_column: null,
    wearable_metric_code: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
    screen: 'morning',
    display_style: null,
  }));
}

/** A minimal, stateful fake SupabaseClient — member_daily_probe_selections genuinely accumulates across simulated days, everything else is static reference data (matching the shape lib/daily-checkin-adaptive/plan.ts actually queries). */
function buildStatefulFakeSupabase(questionRows: ReturnType<typeof buildQuestionRows>) {
  const planRows: PlanRow[] = [];

  function planSelectionsQuery(memberId?: string, localDate?: string, orderByDateDesc = false) {
    const query = {
      eq(col: string, val: string) {
        if (col === 'member_id') return planSelectionsQuery(val, localDate, orderByDateDesc);
        if (col === 'local_date') return planSelectionsQuery(memberId, val, orderByDateDesc);
        return query;
      },
      order() {
        return planSelectionsQuery(memberId, localDate, true);
      },
      then(resolve: (v: { data: PlanRow[]; error: null }) => unknown) {
        let rows = planRows;
        if (memberId) rows = rows.filter((r) => r.member_id === memberId);
        if (localDate) rows = rows.filter((r) => r.local_date === localDate);
        if (orderByDateDesc) rows = [...rows].sort((a, b) => b.local_date.localeCompare(a.local_date));
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return query;
  }

  function builder(table: string) {
    if (table === 'member_daily_probe_selections') {
      return {
        select: () => planSelectionsQuery(),
        upsert: (rows: PlanRow[]) => {
          for (const row of rows) {
            const idx = planRows.findIndex(
              (r) => r.member_id === row.member_id && r.local_date === row.local_date && r.question_key === row.question_key
            );
            if (idx >= 0) planRows[idx] = row;
            else planRows.push(row);
          }
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === 'driver_probe_questions') {
      return { select: () => ({ eq: () => Promise.resolve({ data: questionRows, error: null }) }) };
    }
    // member_goal_selections, driver_goal_weights, member_driver_states — no goal/state data, everything 'unknown' + broad sampling, deliberately, to isolate the recency-driven cycling behavior under test.
    const emptyChain = {
      select: () => emptyChain,
      eq: () => emptyChain,
      order: () => emptyChain,
      limit: () => emptyChain,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: { data: never[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return emptyChain;
  }

  return { from: builder } as unknown as SupabaseClient;
}

describe('bank coverage across a simulated 30-day window (task requirement 3)', () => {
  it('cycles through nearly the entire 90-question bank over 30 days at the new, lower daily rotating count', async () => {
    const questionRows = buildQuestionRows();
    const supabase = buildStatefulFakeSupabase(questionRows);
    const random = mulberry32(20260726);

    const seenKeys = new Set<string>();
    let totalRotatingPicksAcrossAllDays = 0;

    for (let day = 0; day < 30; day++) {
      const localDate = `2026-08-${String(day + 1).padStart(2, '0')}`;
      const plan = await getTodaysCheckinPlan(supabase, 'sim-member', localDate, random);
      totalRotatingPicksAcrossAllDays += plan.rotatingProbes.length;
      for (const q of plan.rotatingProbes) seenKeys.add(q.questionKey);

      // Requirement 3's own ceiling, re-asserted every single simulated day.
      expect(plan.rotatingProbes.length).toBeLessThanOrEqual(ROTATING_PROBE_TARGET_COUNT);
    }

    const coverageFraction = seenKeys.size / BANK_SIZE;
    expect(coverageFraction).toBeGreaterThanOrEqual(0.75);
    // Sanity check on the simulation itself: 30 days at ~3/day should
    // produce roughly bank-sized total picks, not some much smaller
    // number that would make the coverage assertion above meaningless.
    expect(totalRotatingPicksAcrossAllDays).toBeGreaterThan(BANK_SIZE * 0.8);
  });

  it("a repeat visit the same simulated day reconstructs the identical plan rather than re-rolling (day-to-day stability holds inside the simulation too)", async () => {
    const questionRows = buildQuestionRows();
    const supabase = buildStatefulFakeSupabase(questionRows);
    const random = mulberry32(1);

    const first = await getTodaysCheckinPlan(supabase, 'sim-member', '2026-08-01', random);
    const second = await getTodaysCheckinPlan(supabase, 'sim-member', '2026-08-01', () => 0.999);
    // Reconstruction re-derives the set from member_daily_probe_selections
    // and returns it in question-list order rather than original pick
    // order (see getTodaysCheckinPlan) — same plan, not necessarily the
    // same array order, so compare as sets.
    expect(new Set(second.rotatingProbes.map((q) => q.questionKey))).toEqual(
      new Set(first.rotatingProbes.map((q) => q.questionKey))
    );
  });
});
