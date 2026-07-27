/**
 * Daily check-in adaptive picker — turns today's driver_probe_questions
 * rows into the AdaptiveQuestion[] bank lib/adaptive-assessment-engine's
 * unmodified selectBatch() picks from. Pure, no I/O.
 */

import type { AdaptiveQuestion } from '../adaptive-assessment-engine/types';
import { selectNext } from '../adaptive-assessment-engine/select';
import type { DriverState } from '../driver-library/types';
import type { DriverGoalWeight } from '../driver-library/types';
import { goalWeightScoreForDriver } from '../driver-library/weighting';
import { probeWeight } from './scoring';
import { FIXED_CORE_QUESTION_KEYS } from './constants';
import type { DriverProbeQuestion } from './types';

const FIXED_CORE_KEY_SET = new Set<string>(FIXED_CORE_QUESTION_KEYS);

export type ProbeBankInputs = {
  questions: readonly DriverProbeQuestion[];
  memberGoalKeys: readonly string[];
  goalWeights: readonly DriverGoalWeight[];
  /** driverId -> current state; a driver with no entry is treated as 'unknown'. */
  driverStates: ReadonlyMap<string, DriverState>;
  /** questionKey -> most recent local_date it was included in a plan, if ever. */
  lastAskedDates: ReadonlyMap<string, string>;
  /** questionKeys a connected wearable already supplies today's answer for — excluded from the bank entirely so their slot goes to another probe (requirement 6). */
  wearableSuppliedQuestionKeys: ReadonlySet<string>;
  todayLocalDate: string;
};

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Builds the eligible bank for today: drops inactive questions, questions
 * a wearable already answers, and questions whose driver has been ruled
 * out ("score zero and stop appearing" — requirement 4, enforced here by
 * exclusion rather than relying on a zero weight, so a ruled-out driver
 * can never resurface via a tie with `priority`). Everything else gets a
 * weight from lib/daily-checkin-adaptive/scoring.ts.
 */
export function buildProbeBank(inputs: ProbeBankInputs): AdaptiveQuestion[] {
  const bank: AdaptiveQuestion[] = [];

  for (const question of inputs.questions) {
    // "Never let the adaptive layer touch the fixed core" — enforced
    // structurally (the fixed core is never assembled from this bank at
    // all) AND defensively here: a future data-entry mistake that seeds a
    // driver_probe_questions row reusing a fixed-core key must fail
    // loudly rather than silently letting the rotating pool exclude or
    // duplicate a core metric.
    if (FIXED_CORE_KEY_SET.has(question.questionKey)) {
      throw new Error(
        `driver_probe_questions row "${question.questionKey}" reuses a fixed-core question key — the fixed core must never be selectable by the rotating-probe picker.`
      );
    }
    if (!question.active) continue;
    // A null driver_id means this is a local follow-up (e.g. pain
    // location), never a candidate for random rotation — the check-in UI
    // shows those deterministically, not through this bank.
    if (!question.driverId) continue;
    if (inputs.wearableSuppliedQuestionKeys.has(question.questionKey)) continue;

    const state: DriverState = inputs.driverStates.get(question.driverId) ?? 'unknown';
    if (state === 'ruled_out') continue;

    const goalScore = goalWeightScoreForDriver(question.driverId, inputs.memberGoalKeys, inputs.goalWeights);

    const lastAsked = inputs.lastAskedDates.get(question.questionKey);
    const daysSinceLastAsked = lastAsked ? daysBetween(lastAsked, inputs.todayLocalDate) : null;

    bank.push({
      question_key: question.questionKey,
      weight: probeWeight(goalScore, daysSinceLastAsked, state),
      priority: question.priority,
      requires: question.requires.length > 0 ? question.requires : null,
      excludes: question.excludes.length > 0 ? question.excludes : null,
    });
  }

  return bank;
}

/**
 * Every question_key that some active local follow-up (driver_id null,
 * non-empty `requires`) is gated on — i.e. a rotating probe whose key
 * appears here might, depending on today's answer, reveal one more
 * question beyond itself. Used only to price a pick against the daily
 * budget (see selectRotatingProbesWithBudget below), never to change
 * which questions are eligible.
 */
export function followUpParentKeys(questions: readonly DriverProbeQuestion[]): Set<string> {
  const keys = new Set<string>();
  for (const question of questions) {
    if (question.driverId !== null || question.requires.length === 0) continue;
    for (const rule of question.requires) keys.add(rule.question_key);
  }
  return keys;
}

/**
 * 60-second-ceiling pass (task requirement 3): "follow-up probes still
 * fire, but count toward the daily ceiling rather than sitting outside
 * it." Spends `budget` as units rather than picks — a probe with no known
 * local follow-up costs 1 unit, a probe that IS a known follow-up parent
 * costs 2 (itself + a reserved unit for the follow-up it might reveal),
 * so the day's *possible* total (rotating probes + any follow-up that
 * actually triggers) never exceeds MAX_DAILY_QUESTIONS, regardless of
 * whether today's answer happens to trigger it. Stops once the bank runs
 * dry or spending one more unit would go negative.
 */
export function selectRotatingProbesWithBudget<T extends AdaptiveQuestion>(
  bank: readonly T[],
  parentKeysWithFollowUp: ReadonlySet<string>,
  budget: number,
  random: () => number = Math.random
): T[] {
  const picks: T[] = [];
  const exclude = new Set<string>();
  let remaining = budget;

  while (remaining > 0) {
    const next = selectNext(bank, {}, exclude, random);
    if (!next) break;
    const cost = parentKeysWithFollowUp.has(next.question_key) ? 2 : 1;
    if (cost > remaining) break;
    picks.push(next);
    exclude.add(next.question_key);
    remaining -= cost;
  }

  return picks;
}
