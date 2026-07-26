/**
 * Daily check-in adaptive picker — orchestration. Points
 * lib/adaptive-assessment-engine's existing selectBatch() at the daily
 * check-in (per the standing instruction: extend the picker already used
 * by onboarding, never build a second one). A day's plan is computed once
 * and persisted (member_daily_probe_selections) — a repeat visit the
 * same day gets the exact same plan back rather than re-rolling.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectBatch } from '../adaptive-assessment-engine/select';
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
import { buildProbeBank } from './probeBank';
import type { DriverProbeQuestion, TodaysCheckinPlan } from './types';
import { wearableSuppliedQuestionKeys } from './wearableSupply';

async function computeFreshPlan(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  random: () => number
): Promise<TodaysCheckinPlan> {
  const [questions, goalSelection, goalWeights, driverStateRows, lastAskedDates] = await Promise.all([
    listActiveDriverProbeQuestions(supabase),
    fetchLatestMemberGoalSelection(supabase, memberId),
    listDriverGoalWeights(supabase),
    listMemberDriverStates(supabase, memberId),
    lastAskedDatesForMember(supabase, memberId),
  ]);

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

  const picks = selectBatch(bank, {}, [], ROTATING_PROBE_TARGET_COUNT, random);
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
    const questions = await listActiveDriverProbeQuestions(supabase);
    const rotatingProbes = questions.filter((q) => rotatingKeys.has(q.questionKey));
    return { localDate, fixedCoreQuestionKeys: FIXED_CORE_QUESTION_KEYS, rotatingProbes };
  }

  return computeFreshPlan(supabase, memberId, localDate, random);
}
