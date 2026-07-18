/**
 * Daily Wellness Score — eligibility gate + composite for a single day,
 * combining Morning Readiness with the Evening Reflection. This is
 * intentionally NOT the same thing as Root Score (lib/scoring/*, a
 * rolling 30-day composite that never hard-blocks on a single day's
 * completeness) or the older single-day Daily Wellness Index
 * (lib/wellness/wellness-index.ts, still coach-view-only, computes
 * whenever any check-in data exists). This module's whole purpose is the
 * harder rule the product spec calls for: the score must not exist at
 * all — not zero, not a placeholder — until BOTH Morning Readiness and an
 * Evening Reflection exist for the day. Before that, callers must show
 * the unlock message instead of any number.
 */

import type { DailyCheckin, EnergyPattern, EveningReflection } from '@mef/shared-types-contracts';
import {
  inputsFromCheckin as morningInputsFromCheckin,
  isMorningReadinessEligible,
  calculateMorningReadinessScore,
} from './morningReadiness';
import type { MetricStatus } from './status';

export const DAILY_WELLNESS_SCORE_LOCKED_MESSAGE =
  'Your full daily insight unlocks after your evening reflection.';

/**
 * True only once both halves of the day are present. Morning Readiness's
 * own eligibility (bedtime/wake/energy/stress/mood) is reused rather than
 * re-derived, so the two rules can never silently disagree about what
 * "morning data exists" means.
 */
export function isDailyWellnessScoreEligible(
  checkin: DailyCheckin | null,
  eveningReflection: EveningReflection | null
): boolean {
  if (!eveningReflection) return false;
  return isMorningReadinessEligible(morningInputsFromCheckin(checkin));
}

function energyPatternScore(pattern: EnergyPattern | null): number | null {
  if (pattern === null) return null;
  const scores: Record<EnergyPattern, number> = {
    steady: 100,
    improved: 90,
    dipped: 55,
    crashed: 20,
  };
  return scores[pattern];
}

function fivePointDirect(level: number | null): number | null {
  if (level === null) return null;
  return ((level - 1) / 4) * 100;
}

function fivePointInverse(level: number | null): number | null {
  if (level === null) return null;
  return ((5 - level) / 4) * 100;
}

export type DailyWellnessScoreResult = {
  score: number;
  status: MetricStatus;
  morning: ReturnType<typeof calculateMorningReadinessScore>;
  evening: {
    score: number | null;
  };
};

/**
 * Never call without isDailyWellnessScoreEligible() returning true first
 * — same "eligibility check and calculator are separate, caller's
 * responsibility to gate" pattern as Morning Readiness. Weights morning
 * readiness (60%) and the evening reflection's own composite (40%) —
 * morning carries more weight since it has more, more objective inputs;
 * the evening half is deliberately short by design (see Evening
 * Reflection's own docs) and only ever contributes what it actually
 * collected, never fabricating a component for anything unanswered that
 * night.
 */
export function calculateDailyWellnessScore(
  checkin: DailyCheckin | null,
  eveningReflection: EveningReflection
): DailyWellnessScoreResult {
  const morning = calculateMorningReadinessScore(morningInputsFromCheckin(checkin));

  const eveningCandidates = [
    fivePointDirect(eveningReflection.overall_day_rating),
    fivePointInverse(eveningReflection.daytime_stress),
    energyPatternScore(eveningReflection.energy_pattern),
    fivePointDirect(eveningReflection.recovery),
  ].filter((v): v is number => v !== null);

  const eveningScore =
    eveningCandidates.length > 0
      ? Math.round(eveningCandidates.reduce((sum, v) => sum + v, 0) / eveningCandidates.length)
      : null;

  const finalScore =
    eveningScore === null ? morning.score : Math.round(morning.score * 0.6 + eveningScore * 0.4);

  const status: MetricStatus = finalScore >= 70 ? 'good' : finalScore >= 55 ? 'attention' : 'poor';

  return {
    score: finalScore,
    status,
    morning,
    evening: { score: eveningScore },
  };
}
