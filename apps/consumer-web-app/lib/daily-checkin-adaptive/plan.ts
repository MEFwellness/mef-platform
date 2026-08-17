/**
 * Daily check-in adaptive picker — orchestration. Points
 * lib/adaptive-assessment-engine's existing selectBatch() at the daily
 * check-in (per the standing instruction: extend the picker already used
 * by onboarding, never build a second one). A day's plan is computed once
 * and persisted (member_daily_probe_selections) — a repeat visit the
 * same day gets the exact same plan back rather than re-rolling.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchLatestMemberGoalSelection } from '../member-goals/data';
import { listDriverGoalWeights, listMemberDriverStates } from '../driver-library/data';
import type { DriverState } from '../driver-library/types';
import { FIXED_CORE_QUESTION_KEYS, ROTATING_PROBE_TARGET_COUNT } from './constants';
import {
  existingPlanSelections,
  lastAskedDatesForMember,
  listActiveDriverProbeQuestions,
  recordPlanSelections,
} from './data';
import { buildProbeBank, followUpParentKeys, selectRotatingProbesWithBudget } from './probeBank';
import type { DriverProbeQuestion, TodaysCheckinPlan } from './types';
import { wearableSuppliedQuestionKeys } from './wearableSupply';
import { isHydrationTracked } from '../hydration/data';
import { HYDRATION_CHECKIN_COLUMN, HYDRATION_DRIVER_ID } from '../hydration/constants';

/**
 * Conditional water tracking (migration 163) — the water questions, gone
 * from the check-in entirely for a member who does not track water.
 *
 * Matched two ways, not one. A question belongs to the Hydration driver, or
 * it writes to the water column. Either is enough: coaches can add and edit
 * questions on /coach/questions without a deploy, so a rule that only knew
 * today's one seeded question key (checkin_probe.hydration_felt_adequate)
 * would quietly stop working the first time somebody wrote a second one.
 *
 * Applied to BOTH paths below — the fresh plan and the replay of an already
 * recorded one — so a member who turned water off after today's plan was
 * computed does not still get asked today.
 */
function withoutUntrackedHydrationQuestions(
  questions: DriverProbeQuestion[],
  hydrationTracked: boolean
): DriverProbeQuestion[] {
  if (hydrationTracked) return questions;
  return questions.filter(
    (q) => q.driverId !== HYDRATION_DRIVER_ID && q.dailyCheckinsColumn !== HYDRATION_CHECKIN_COLUMN
  );
}

async function computeFreshPlan(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  random: () => number
): Promise<TodaysCheckinPlan> {
  const [allQuestions, goalSelection, goalWeights, driverStateRows, lastAskedDates, hydrationTracked] =
    await Promise.all([
      listActiveDriverProbeQuestions(supabase),
      fetchLatestMemberGoalSelection(supabase, memberId),
      listDriverGoalWeights(supabase),
      listMemberDriverStates(supabase, memberId),
      lastAskedDatesForMember(supabase, memberId),
      isHydrationTracked(supabase, memberId),
    ]);

  const questions = withoutUntrackedHydrationQuestions(allQuestions, hydrationTracked);

  const driverStates = new Map<string, DriverState>(
    [...driverStateRows.entries()].map(([driverId, row]) => [driverId, row.state])
  );

  const wearableSupplied = await wearableSuppliedQuestionKeys(supabase, memberId, localDate, questions);

  const bank = buildProbeBank({
    questions,
    memberGoalKeys: goalSelection?.goals ?? [],
    goalWeights,
    driverStates,
    lastAskedDates,
    wearableSuppliedQuestionKeys: wearableSupplied,
    todayLocalDate: localDate,
  });

  const picks = selectRotatingProbesWithBudget(bank, followUpParentKeys(questions), ROTATING_PROBE_TARGET_COUNT, random);
  const questionsByKey = new Map(questions.map((q) => [q.questionKey, q]));
  const rotatingProbes = picks
    .map((pick) => questionsByKey.get(pick.question_key))
    .filter((q): q is DriverProbeQuestion => q !== undefined);

  await recordPlanSelections(supabase, memberId, localDate, [
    ...FIXED_CORE_QUESTION_KEYS.map((key) => ({ questionKey: key, kind: 'fixed_core' as const })),
    ...rotatingProbes.map((q) => ({ questionKey: q.questionKey, kind: 'rotating_probe' as const })),
  ]);

  return { localDate, fixedCoreQuestionKeys: FIXED_CORE_QUESTION_KEYS, rotatingProbes };
}

/**
 * The stable, once-per-day plan: fixed core (never rotated) plus this
 * day's chosen rotating driver probes. Reconstructs from
 * member_daily_probe_selections if this member already has a recorded
 * plan for `localDate`; otherwise computes and persists a fresh one.
 */
export async function getTodaysCheckinPlan(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  random: () => number = Math.random
): Promise<TodaysCheckinPlan> {
  const existing = await existingPlanSelections(supabase, memberId, localDate);
  if (existing !== null) {
    const rotatingKeys = new Set(
      existing.filter((s) => s.kind === 'rotating_probe').map((s) => s.questionKey)
    );
    if (rotatingKeys.size === 0) {
      return { localDate, fixedCoreQuestionKeys: FIXED_CORE_QUESTION_KEYS, rotatingProbes: [] };
    }
    const [questions, hydrationTracked] = await Promise.all([
      listActiveDriverProbeQuestions(supabase),
      isHydrationTracked(supabase, memberId),
    ]);
    const rotatingProbes = withoutUntrackedHydrationQuestions(
      questions.filter((q) => rotatingKeys.has(q.questionKey)),
      hydrationTracked
    );
    return { localDate, fixedCoreQuestionKeys: FIXED_CORE_QUESTION_KEYS, rotatingProbes };
  }

  return computeFreshPlan(supabase, memberId, localDate, random);
}
