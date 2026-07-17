/**
 * Resilience Score — how consistently a member's daily wellness pattern
 * returns to baseline after a disrupted stretch. Architecture-complete
 * from day one, but this file's own eligibility gate is what actually
 * decides whether a member ever sees a real number: real history and at
 * least two observed recover-from-a-dip cycles are required, or the
 * result is always { score: null, state: 'building_baseline' } — never a
 * fabricated placeholder number.
 *
 * Reuses lib/wellness/wellness-index.ts's calculateWellnessIndex as the
 * daily composite proxy (a real, already-shipping, single-day 0-100
 * score) rather than inventing a second "daily wellness number" — one
 * definition of "how was this day" for the whole platform.
 */

import type { DailyCheckin, ResilienceState, ScoreConfidenceLevel } from '@mef/shared-types-contracts';
import { calculateWellnessIndex, inputsFromCheckin } from '@/lib/wellness/wellness-index';
import { daysBetweenLocalDates } from '@/lib/feed/dateMath';
import {
  RESILIENCE_DIP_MIN_CONSECUTIVE_DAYS,
  RESILIENCE_DIP_THRESHOLD_POINTS,
  RESILIENCE_MIN_CHECKIN_COUNT,
  RESILIENCE_MIN_HISTORY_DAYS,
  RESILIENCE_MIN_RECOVERED_CYCLES,
  RESILIENCE_RECOVERY_THRESHOLD_POINTS,
  RESILIENCE_RECOVERY_WINDOW_DAYS,
} from './config';

export type ResilienceResult = {
  score: number | null;
  state: ResilienceState;
  confidenceLevel: ScoreConfidenceLevel;
  cyclesFound: number;
};

const BUILDING: ResilienceResult = {
  score: null,
  state: 'building_baseline',
  confidenceLevel: 'building',
  cyclesFound: 0,
};

type DailyPoint = { localDate: string; score: number };

/**
 * checkinsOldestFirst should already be limited to the lookback window
 * (see lib/scoring/config.ts's RESILIENCE_LOOKBACK_DAYS) by the caller —
 * this function only ever reasons about whatever it's given.
 */
export function computeResilience(checkinsOldestFirst: DailyCheckin[], asOfLocalDate: string): ResilienceResult {
  if (checkinsOldestFirst.length === 0) return BUILDING;

  const firstDate = checkinsOldestFirst[0]!.local_date;
  const historyDays = daysBetweenLocalDates(firstDate, asOfLocalDate);
  if (historyDays < RESILIENCE_MIN_HISTORY_DAYS || checkinsOldestFirst.length < RESILIENCE_MIN_CHECKIN_COUNT) {
    return BUILDING;
  }

  const points: DailyPoint[] = [];
  for (const checkin of checkinsOldestFirst) {
    const result = calculateWellnessIndex(inputsFromCheckin(checkin));
    if (result) points.push({ localDate: checkin.local_date, score: result.score });
  }
  if (points.length < RESILIENCE_MIN_CHECKIN_COUNT) return BUILDING;

  const baseline = points.reduce((sum, p) => sum + p.score, 0) / points.length;

  // Find every run of >= RESILIENCE_DIP_MIN_CONSECUTIVE_DAYS consecutive
  // days at least RESILIENCE_DIP_THRESHOLD_POINTS below baseline.
  const dips: Array<{ startIdx: number; endIdx: number }> = [];
  let runStart: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const below = points[i]!.score <= baseline - RESILIENCE_DIP_THRESHOLD_POINTS;
    if (below) {
      if (runStart === null) runStart = i;
    } else if (runStart !== null) {
      if (i - runStart >= RESILIENCE_DIP_MIN_CONSECUTIVE_DAYS) dips.push({ startIdx: runStart, endIdx: i - 1 });
      runStart = null;
    }
  }
  if (runStart !== null && points.length - runStart >= RESILIENCE_DIP_MIN_CONSECUTIVE_DAYS) {
    dips.push({ startIdx: runStart, endIdx: points.length - 1 });
  }

  let activeUnresolvedDip = false;
  const recoverySpeedScores: number[] = [];

  dips.forEach((dip, dipIndex) => {
    const dipEndDate = points[dip.endIdx]!.localDate;
    let recoveredAtIdx: number | null = null;

    for (let j = dip.endIdx + 1; j < points.length; j++) {
      const daysSinceDipEnd = daysBetweenLocalDates(dipEndDate, points[j]!.localDate);
      if (daysSinceDipEnd > RESILIENCE_RECOVERY_WINDOW_DAYS) break;
      if (points[j]!.score >= baseline - RESILIENCE_RECOVERY_THRESHOLD_POINTS) {
        recoveredAtIdx = j;
        break;
      }
    }

    if (recoveredAtIdx !== null) {
      const recoveryDays = daysBetweenLocalDates(dipEndDate, points[recoveredAtIdx]!.localDate);
      const boundedDays = Math.max(0, Math.min(recoveryDays, RESILIENCE_RECOVERY_WINDOW_DAYS));
      recoverySpeedScores.push(Math.round(100 * (1 - boundedDays / RESILIENCE_RECOVERY_WINDOW_DAYS)));
    } else if (dipIndex === dips.length - 1) {
      // The most recent dip never recovered within the window (or is
      // still ongoing) — the member is currently in a disrupted stretch.
      activeUnresolvedDip = true;
    }
  });

  if (recoverySpeedScores.length < RESILIENCE_MIN_RECOVERED_CYCLES) {
    return { ...BUILDING, cyclesFound: recoverySpeedScores.length };
  }

  const score = Math.max(
    10,
    Math.min(100, Math.round(recoverySpeedScores.reduce((s, v) => s + v, 0) / recoverySpeedScores.length))
  );
  const state: ResilienceState = activeUnresolvedDip ? 'recovering' : score < 40 ? 'strained' : 'stable';
  const confidenceLevel: ScoreConfidenceLevel =
    recoverySpeedScores.length >= 4 ? 'high' : recoverySpeedScores.length >= 3 ? 'moderate' : 'low';

  return { score, state, confidenceLevel, cyclesFound: recoverySpeedScores.length };
}
