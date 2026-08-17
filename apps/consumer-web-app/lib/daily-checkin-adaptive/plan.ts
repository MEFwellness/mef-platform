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
import { listActiveDrivers, listDriverGoalWeights, listMemberDriverStates } from '../driver-library/data';
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
import { buildVisibilityContext } from '../visibility/context';
import { fetchStoredVisibility } from '../visibility/data';
import { resolveVisibility } from '../visibility/resolve';
import { DRIVER_DOMAIN_TO_FEATURE } from '../visibility/catalog';

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

/**
 * VISIBILITY LAYER (2026-08-17) — follow-up question sets.
 *
 * "An answer can open a short follow-up set, and unanswered branches simply
 * never appear." In this app the follow-up sets already exist: they are the
 * rotating driver probes, grouped by the driver domain each one belongs to
 * (`driver_domains`, migration 106). What was missing is that every domain
 * was offered to every member, so a member with no digestion concern was
 * still in the pool for digestion questions.
 *
 * Each driver domain now maps to one catalog entry (`questions.sleep`,
 * `questions.stress`, ...), and a probe whose domain is not revealed for her
 * never enters the bank at all. It is not skipped at render time and it is
 * not shown greyed out; it is not a candidate.
 *
 * Matched by the DRIVER'S DOMAIN and never by question key, deliberately and
 * for exactly the reason the hydration gate is matched two ways: coaches add
 * and edit questions on /coach/questions without a deploy, so a rule that
 * knew today's eighty-eight question keys would quietly stop working the
 * first time somebody wrote the eighty-ninth.
 *
 * A probe with no driver, or one whose driver belongs to a domain this
 * catalog does not know, is KEPT. Failing open here is the right direction:
 * the alternative is a member silently losing a question a coach wrote,
 * with nothing on any screen to say why.
 */
async function revealedProbeDomainKeys(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<Set<string>> {
  try {
    const [context, stored] = await Promise.all([
      buildVisibilityContext(supabase, memberId, localDate),
      fetchStoredVisibility(supabase, memberId),
    ]);
    const visibility = resolveVisibility({ context, stored });
    const revealed = new Set<string>();
    for (const [domainKey, featureKey] of Object.entries(DRIVER_DOMAIN_TO_FEATURE)) {
      if (visibility.byKey.get(featureKey)?.visible) revealed.add(domainKey);
    }
    return revealed;
  } catch (error) {
    console.error('revealedProbeDomainKeys failed', error);
    // Unreadable resolves to "every domain", which is exactly today's
    // behaviour. A visibility read failing must never remove a member's
    // check-in questions.
    return new Set(Object.keys(DRIVER_DOMAIN_TO_FEATURE));
  }
}

function withoutHiddenQuestionSets(
  questions: DriverProbeQuestion[],
  domainKeyByDriverId: Map<string, string>,
  revealedDomainKeys: Set<string>
): DriverProbeQuestion[] {
  return questions.filter((q) => {
    if (!q.driverId) return true;
    const domainKey = domainKeyByDriverId.get(q.driverId);
    if (!domainKey) return true;
    if (!(domainKey in DRIVER_DOMAIN_TO_FEATURE)) return true;
    return revealedDomainKeys.has(domainKey);
  });
}

async function computeFreshPlan(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  random: () => number
): Promise<TodaysCheckinPlan> {
  const [
    allQuestions,
    goalSelection,
    goalWeights,
    driverStateRows,
    lastAskedDates,
    hydrationTracked,
    drivers,
    revealedDomainKeys,
  ] = await Promise.all([
    listActiveDriverProbeQuestions(supabase),
    fetchLatestMemberGoalSelection(supabase, memberId),
    listDriverGoalWeights(supabase),
    listMemberDriverStates(supabase, memberId),
    lastAskedDatesForMember(supabase, memberId),
    isHydrationTracked(supabase, memberId),
    listActiveDrivers(supabase),
    revealedProbeDomainKeys(supabase, memberId, localDate),
  ]);

  const domainKeyByDriverId = new Map(drivers.map((d) => [d.id, d.domainKey] as const));

  const questions = withoutHiddenQuestionSets(
    withoutUntrackedHydrationQuestions(allQuestions, hydrationTracked),
    domainKeyByDriverId,
    revealedDomainKeys
  );

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
    // Applied to the replay path as well as the fresh one, for the same
    // reason the hydration gate is: a member whose rules changed after
    // today's plan was computed does not still get asked today.
    const [questions, hydrationTracked, drivers, revealedDomainKeys] = await Promise.all([
      listActiveDriverProbeQuestions(supabase),
      isHydrationTracked(supabase, memberId),
      listActiveDrivers(supabase),
      revealedProbeDomainKeys(supabase, memberId, localDate),
    ]);
    const domainKeyByDriverId = new Map(drivers.map((d) => [d.id, d.domainKey] as const));
    const rotatingProbes = withoutHiddenQuestionSets(
      withoutUntrackedHydrationQuestions(
        questions.filter((q) => rotatingKeys.has(q.questionKey)),
        hydrationTracked
      ),
      domainKeyByDriverId,
      revealedDomainKeys
    );
    return { localDate, fixedCoreQuestionKeys: FIXED_CORE_QUESTION_KEYS, rotatingProbes };
  }

  return computeFreshPlan(supabase, memberId, localDate, random);
}
