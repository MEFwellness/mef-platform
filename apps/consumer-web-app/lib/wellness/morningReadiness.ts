/**
 * Morning Readiness Score — a single 0-100 score computed only from a
 * day's Morning Readiness inputs (bedtime/wake time, night waking, night
 * sweats, morning energy, morning soreness, stress on waking, mood, bowel
 * movement status). Deliberately independent of the Evening Reflection
 * and of Root Score: this score exists so "I only did my morning check-in"
 * is always a complete, valid day on its own — see
 * isMorningReadinessEligible() below, the hard gate the product spec
 * calls for ("may appear only when its required morning inputs exist").
 *
 * Same "never fabricate" discipline as lib/wellness/wellness-index.ts:
 * a metric that wasn't logged is excluded from the weighted average
 * (weight redistributed across what's present) rather than guessed at,
 * and calculateMorningReadinessScore() itself is never called unless
 * isMorningReadinessEligible() has already returned true.
 */

import type { BowelMovementStatus, DailyCheckin } from '@mef/shared-types-contracts';
import { moodStatus, energyStatus, stressStatus, type MetricStatus } from './status';

export type MorningReadinessMetricKey =
  | 'sleepDuration'
  | 'nightWaking'
  | 'morningEnergy'
  | 'morningSoreness'
  | 'stressOnWaking'
  | 'mood'
  | 'bowelMovement';

export const MORNING_READINESS_WEIGHTS: Record<MorningReadinessMetricKey, number> = {
  sleepDuration: 0.2,
  nightWaking: 0.15,
  morningEnergy: 0.2,
  morningSoreness: 0.1,
  stressOnWaking: 0.15,
  mood: 0.15,
  bowelMovement: 0.05,
};

export type MorningReadinessInputs = {
  actualBedtime: string | null;
  actualWakeTime: string | null;
  nightWakingCount: number | null;
  nightSweats: boolean | null;
  morningEnergy: number | null;
  morningSoreness: number | null;
  stressOnWaking: number | null;
  mood: number | null;
  bowelMovementStatus: BowelMovementStatus | null;
};

export function inputsFromCheckin(checkin: DailyCheckin | null): MorningReadinessInputs {
  return {
    actualBedtime: checkin?.actual_bedtime ?? null,
    actualWakeTime: checkin?.actual_wake_time ?? null,
    nightWakingCount: checkin?.night_waking_count ?? null,
    nightSweats: checkin?.night_sweats ?? null,
    morningEnergy: checkin?.energy_level ?? null,
    morningSoreness: checkin?.morning_soreness ?? null,
    stressOnWaking: checkin?.stress_level ?? null,
    mood: checkin?.mood_level ?? null,
    bowelMovementStatus: checkin?.bowel_movement_status ?? null,
  };
}

/**
 * The hard eligibility gate: a Morning Readiness Score may only be shown
 * once bedtime, wake time, morning energy, stress on waking, and mood all
 * exist for the day — the core set the check-in form itself requires
 * before it will submit (see CheckinForm.tsx's handleSubmit validation,
 * which matches this exactly). Everything else (night waking/sweats,
 * soreness, bowel movement) is optional-but-encouraged and only affects
 * the score's weighting once present, never its eligibility.
 */
export function isMorningReadinessEligible(inputs: MorningReadinessInputs): boolean {
  return (
    inputs.actualBedtime !== null &&
    inputs.actualWakeTime !== null &&
    inputs.morningEnergy !== null &&
    inputs.stressOnWaking !== null &&
    inputs.mood !== null
  );
}

function fivePointDirect(level: number | null): number | null {
  if (level === null) return null;
  return ((level - 1) / 4) * 100;
}

function fivePointInverse(level: number | null): number | null {
  if (level === null) return null;
  return ((5 - level) / 4) * 100;
}

/** Minutes asleep between actual_bedtime and actual_wake_time, handling an overnight wrap (bed before midnight, wake after). Null if either clock time is missing. */
export function sleepDurationMinutes(bedtime: string | null, wakeTime: string | null): number | null {
  if (!bedtime || !wakeTime) return null;
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wakeTime.split(':').map(Number);
  if (bh === undefined || bm === undefined || wh === undefined || wm === undefined) return null;
  if ([bh, bm, wh, wm].some((n) => Number.isNaN(n))) return null;

  const bedMinutes = bh * 60 + bm;
  const wakeMinutes = wh * 60 + wm;
  const diff = wakeMinutes - bedMinutes;
  return diff > 0 ? diff : diff + 24 * 60;
}

function sleepDurationScore(minutes: number | null): number | null {
  if (minutes === null) return null;
  const hours = minutes / 60;
  if (hours < 5) return 10;
  if (hours < 6) return 45;
  if (hours < 7) return 65;
  if (hours < 8) return 90;
  return 100;
}

function nightWakingScore(count: number | null, sweats: boolean | null): number | null {
  if (count === null) return null;
  const base = count === 0 ? 100 : count === 1 ? 75 : count <= 3 ? 45 : 15;
  return sweats ? Math.max(0, base - 20) : base;
}

const BOWEL_MOVEMENT_SCORE: Record<BowelMovementStatus, number> = {
  normal: 100,
  loose: 55,
  constipated: 45,
  none: 60,
};

export type MorningReadinessMetricScore = {
  key: MorningReadinessMetricKey;
  score: number;
  status: MetricStatus;
};

export type MorningReadinessResult = {
  score: number;
  status: MetricStatus;
  metrics: MorningReadinessMetricScore[];
};

/**
 * Never call this without first checking isMorningReadinessEligible() —
 * it does not itself guard eligibility, same separation of concerns as
 * calculateWellnessIndex() (which does guard, differently, by returning
 * null when nothing at all is logged). This function assumes the caller
 * already decided a score is allowed to exist for this day.
 */
export function calculateMorningReadinessScore(inputs: MorningReadinessInputs): MorningReadinessResult {
  const sleepMinutes = sleepDurationMinutes(inputs.actualBedtime, inputs.actualWakeTime);

  const candidates: { key: MorningReadinessMetricKey; score: number | null; status: MetricStatus }[] = [
    {
      key: 'sleepDuration',
      score: sleepDurationScore(sleepMinutes),
      status: sleepMinutes === null ? 'no-data' : sleepMinutes / 60 >= 7 ? 'good' : sleepMinutes / 60 >= 6 ? 'attention' : 'poor',
    },
    {
      key: 'nightWaking',
      score: nightWakingScore(inputs.nightWakingCount, inputs.nightSweats),
      status:
        inputs.nightWakingCount === null
          ? 'no-data'
          : inputs.nightWakingCount === 0 && !inputs.nightSweats
            ? 'good'
            : inputs.nightWakingCount <= 1
              ? 'attention'
              : 'poor',
    },
    { key: 'morningEnergy', score: fivePointDirect(inputs.morningEnergy), status: energyStatus(inputs.morningEnergy) },
    {
      key: 'morningSoreness',
      score: fivePointInverse(inputs.morningSoreness),
      status: inputs.morningSoreness === null ? 'no-data' : inputs.morningSoreness <= 2 ? 'good' : inputs.morningSoreness === 3 ? 'attention' : 'poor',
    },
    { key: 'stressOnWaking', score: fivePointInverse(inputs.stressOnWaking), status: stressStatus(inputs.stressOnWaking) },
    { key: 'mood', score: fivePointDirect(inputs.mood), status: moodStatus(inputs.mood) },
    {
      key: 'bowelMovement',
      score: inputs.bowelMovementStatus ? BOWEL_MOVEMENT_SCORE[inputs.bowelMovementStatus] : null,
      status:
        inputs.bowelMovementStatus === null
          ? 'no-data'
          : inputs.bowelMovementStatus === 'normal'
            ? 'good'
            : inputs.bowelMovementStatus === 'none'
              ? 'attention'
              : 'poor',
    },
  ];

  const available = candidates.filter(
    (c): c is { key: MorningReadinessMetricKey; score: number; status: MetricStatus } => c.score !== null
  );

  const totalWeight = available.reduce((sum, c) => sum + MORNING_READINESS_WEIGHTS[c.key], 0);
  const weightedSum = available.reduce((sum, c) => sum + c.score * MORNING_READINESS_WEIGHTS[c.key], 0);
  const finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  const status: MetricStatus = finalScore >= 70 ? 'good' : finalScore >= 55 ? 'attention' : 'poor';

  return {
    score: finalScore,
    status,
    metrics: available.map((c) => ({ key: c.key, score: Math.round(c.score), status: c.status })),
  };
}
