/**
 * Root Score System — per-domain calculators. Every function here is a
 * pure function over already-fetched, real rows (no Supabase calls, no
 * randomness) so each one is independently unit-testable and the "never
 * fabricate a score" rule is mechanically enforced: a domain with zero
 * qualifying rows in its window always returns score: null, never a
 * guessed or zero-filled number.
 *
 * All five domains share the same output shape (DomainScore) so
 * lib/scoring/aggregate.ts can combine them generically without knowing
 * which domain produced which score.
 */

import type {
  BodyAssessment,
  DailyCheckin,
  DomainScore,
  MovementSession,
  ScoreConfidenceLevel,
  ScoreDomainKey,
  ScoreTrendDirection,
} from '@mef/shared-types-contracts';
import { CONFIDENCE_THRESHOLDS, DOMAIN_LABEL } from './config';

export type DateWindow = { startDate: string; endDate: string };

function inWindow(localDate: string, window: DateWindow): boolean {
  return localDate >= window.startDate && localDate <= window.endDate;
}

/**
 * Coverage-based confidence for a single domain: how much of the window's
 * "full" expected data volume is actually present. Independent of the
 * score itself — a domain can score well with low confidence (2 great
 * meals logged) or score poorly with high confidence (20 stressful days,
 * reliably logged).
 */
function coverageConfidence(
  dataPoints: number,
  expectedForFullConfidence: number
): { level: ScoreConfidenceLevel; ratio: number } {
  if (dataPoints <= 0 || expectedForFullConfidence <= 0) return { level: 'building', ratio: 0 };
  const ratio = Math.min(1, dataPoints / expectedForFullConfidence);
  const level: ScoreConfidenceLevel =
    ratio >= CONFIDENCE_THRESHOLDS.high
      ? 'high'
      : ratio >= CONFIDENCE_THRESHOLDS.moderate
        ? 'moderate'
        : ratio >= CONFIDENCE_THRESHOLDS.low
          ? 'low'
          : 'building';
  return { level, ratio };
}

/**
 * Direction from a chronological (oldest-first) series of per-day 0-100
 * scores: compares the mean of the newer half against the older half.
 * Requires at least 4 data points spread across both halves, otherwise
 * 'unknown' rather than a direction claimed from noise.
 */
function directionFromSeries(oldestFirstScores: number[]): ScoreTrendDirection {
  if (oldestFirstScores.length < 4) return 'unknown';
  const mid = Math.floor(oldestFirstScores.length / 2);
  const older = oldestFirstScores.slice(0, mid);
  const newer = oldestFirstScores.slice(mid);
  const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
  const newerAvg = newer.reduce((s, v) => s + v, 0) / newer.length;
  const delta = newerAvg - olderAvg;
  if (delta > 3) return 'improving';
  if (delta < -3) return 'declining';
  return 'stable';
}

function emptyDomain(domain: ScoreDomainKey, windowDays: number, explanation: string): DomainScore {
  return {
    domain,
    label: DOMAIN_LABEL[domain],
    score: null,
    confidence_level: 'building',
    direction: 'unknown',
    data_points: 0,
    window_days: windowDays,
    explanation,
  };
}

// ---------------------------------------------------------------------
// Recovery (sleep + energy) — from DailyCheckin.
// ---------------------------------------------------------------------

const SLEEP_DURATION_SCORE: Record<NonNullable<DailyCheckin['sleep_duration']>, number> = {
  '<5h': 10,
  '5-6h': 45,
  '6-7h': 65,
  '7-8h': 90,
  '8h+': 100,
};

function fivePointDirect(level: number | null | undefined): number | null {
  if (level === null || level === undefined) return null;
  return ((level - 1) / 4) * 100;
}

export function computeRecoveryDomain(checkins: DailyCheckin[], window: DateWindow): DomainScore {
  const inRange = checkins.filter((c) => inWindow(c.local_date, window));
  const windowDays = Math.max(1, Math.round(
    (new Date(`${window.endDate}T00:00:00Z`).getTime() - new Date(`${window.startDate}T00:00:00Z`).getTime()) / 86_400_000
  ) + 1);

  const dailyScores: number[] = [];
  for (const c of inRange) {
    const parts = [
      fivePointDirect(c.sleep_quality),
      c.sleep_duration ? SLEEP_DURATION_SCORE[c.sleep_duration] : null,
      fivePointDirect(c.energy_level),
    ].filter((v): v is number => v !== null);
    if (parts.length > 0) dailyScores.push(parts.reduce((s, v) => s + v, 0) / parts.length);
  }

  if (dailyScores.length === 0) {
    return emptyDomain('recovery', windowDays, 'No sleep or energy check-ins logged in this window yet.');
  }

  const score = Math.round(dailyScores.reduce((s, v) => s + v, 0) / dailyScores.length);
  const { level } = coverageConfidence(dailyScores.length, windowDays);
  const direction = directionFromSeries(dailyScores);

  return {
    domain: 'recovery',
    label: DOMAIN_LABEL.recovery,
    score,
    confidence_level: level,
    direction,
    data_points: dailyScores.length,
    window_days: windowDays,
    explanation:
      direction === 'improving'
        ? 'Sleep and energy have been trending up.'
        : direction === 'declining'
          ? 'Sleep and energy have softened recently.'
          : `Based on ${dailyScores.length} logged day${dailyScores.length === 1 ? '' : 's'} of sleep and energy.`,
  };
}

// ---------------------------------------------------------------------
// Stress — from DailyCheckin.stress_level (inverse: low is good).
// ---------------------------------------------------------------------

export function computeStressDomain(checkins: DailyCheckin[], window: DateWindow): DomainScore {
  const inRange = checkins.filter((c) => inWindow(c.local_date, window) && c.stress_level !== null);
  const windowDays = Math.max(1, Math.round(
    (new Date(`${window.endDate}T00:00:00Z`).getTime() - new Date(`${window.startDate}T00:00:00Z`).getTime()) / 86_400_000
  ) + 1);

  if (inRange.length === 0) {
    return emptyDomain('stress', windowDays, 'No stress readings logged in this window yet.');
  }

  const dailyScores = inRange.map((c) => ((5 - c.stress_level!) / 4) * 100);
  const score = Math.round(dailyScores.reduce((s, v) => s + v, 0) / dailyScores.length);
  const { level } = coverageConfidence(inRange.length, windowDays);
  const direction = directionFromSeries(dailyScores);

  return {
    domain: 'stress',
    label: DOMAIN_LABEL.stress,
    score,
    confidence_level: level,
    direction,
    data_points: inRange.length,
    window_days: windowDays,
    explanation:
      direction === 'improving'
        ? 'Reported stress has been easing.'
        : direction === 'declining'
          ? 'Reported stress has been climbing.'
          : `Based on ${inRange.length} stress reading${inRange.length === 1 ? '' : 's'} this window.`,
  };
}

// ---------------------------------------------------------------------
// Nutrition — from Food Lens meal-quality ratings (green/yellow/red).
// ---------------------------------------------------------------------

export type MealQualityEvent = { logged_at: string; rating: 'green' | 'yellow' | 'red' };

const MEAL_QUALITY_SCORE: Record<MealQualityEvent['rating'], number> = {
  green: 100,
  yellow: 60,
  red: 20,
};

export function computeNutritionDomain(events: MealQualityEvent[], window: DateWindow): DomainScore {
  const inRange = events.filter((e) => inWindow(e.logged_at.slice(0, 10), window));
  const windowDays = Math.max(1, Math.round(
    (new Date(`${window.endDate}T00:00:00Z`).getTime() - new Date(`${window.startDate}T00:00:00Z`).getTime()) / 86_400_000
  ) + 1);

  if (inRange.length === 0) {
    return emptyDomain('nutrition', windowDays, 'No Food Lens meals logged in this window yet.');
  }

  const chronological = [...inRange].sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  const dailyScores = chronological.map((e) => MEAL_QUALITY_SCORE[e.rating]);
  const score = Math.round(dailyScores.reduce((s, v) => s + v, 0) / dailyScores.length);
  // Full confidence expects roughly one logged meal every other day — logging every single
  // meal isn't realistic or required for a meaningful nutrition signal.
  const { level } = coverageConfidence(inRange.length, Math.max(1, Math.round(windowDays / 2)));
  const direction = directionFromSeries(dailyScores);

  return {
    domain: 'nutrition',
    label: DOMAIN_LABEL.nutrition,
    score,
    confidence_level: level,
    direction,
    data_points: inRange.length,
    window_days: windowDays,
    explanation:
      direction === 'improving'
        ? 'Logged meal quality has been trending up.'
        : direction === 'declining'
          ? 'Logged meal quality has softened recently.'
          : `Based on ${inRange.length} logged meal${inRange.length === 1 ? '' : 's'} this window.`,
  };
}

// ---------------------------------------------------------------------
// Movement — from completed movement sessions + completed body assessments.
// ---------------------------------------------------------------------

const WEEKLY_SESSION_TARGET = 4;

export function computeMovementDomain(
  sessions: MovementSession[],
  assessments: BodyAssessment[],
  window: DateWindow
): DomainScore {
  const sessionsInRange = sessions.filter((s) => inWindow(s.local_date, window));
  const completed = sessionsInRange.filter((s) => s.status === 'completed');
  const assessmentsInRange = assessments.filter(
    (a) => a.completed_at !== null && inWindow(a.local_date, window)
  );
  const windowDays = Math.max(1, Math.round(
    (new Date(`${window.endDate}T00:00:00Z`).getTime() - new Date(`${window.startDate}T00:00:00Z`).getTime()) / 86_400_000
  ) + 1);

  const dataPoints = completed.length + assessmentsInRange.length;
  if (sessionsInRange.length === 0 && assessmentsInRange.length === 0) {
    return emptyDomain('movement', windowDays, 'No movement sessions or assessments in this window yet.');
  }

  const target = Math.max(1, Math.round((windowDays / 7) * WEEKLY_SESSION_TARGET));
  // A completed structural assessment counts as a bonus session-equivalent — real
  // engagement with movement, even outside the daily session flow.
  const effectiveCompleted = completed.length + Math.min(assessmentsInRange.length, 2);
  const score = Math.min(100, Math.round((effectiveCompleted / target) * 100));
  const { level } = coverageConfidence(dataPoints, target);

  const chronological = [...completed].sort((a, b) => a.local_date.localeCompare(b.local_date));
  const half = Math.floor(chronological.length / 2);
  const direction: ScoreTrendDirection =
    chronological.length < 4
      ? 'unknown'
      : chronological.slice(half).length > chronological.slice(0, half).length
        ? 'improving'
        : chronological.slice(half).length < chronological.slice(0, half).length
          ? 'declining'
          : 'stable';

  return {
    domain: 'movement',
    label: DOMAIN_LABEL.movement,
    score,
    confidence_level: level,
    direction,
    data_points: dataPoints,
    window_days: windowDays,
    explanation: `${completed.length} completed session${completed.length === 1 ? '' : 's'} against a target of ${target} this window.`,
  };
}

// ---------------------------------------------------------------------
// Consistency — check-in completion rate, scaled to how long the member
// has actually had check-ins available (never penalized for a window
// that predates their first-ever check-in).
// ---------------------------------------------------------------------

export function computeConsistencyDomain(
  checkins: DailyCheckin[],
  firstEverCheckinDate: string | null,
  window: DateWindow
): DomainScore {
  const windowDays = Math.max(1, Math.round(
    (new Date(`${window.endDate}T00:00:00Z`).getTime() - new Date(`${window.startDate}T00:00:00Z`).getTime()) / 86_400_000
  ) + 1);

  if (firstEverCheckinDate === null) {
    return emptyDomain('consistency', windowDays, 'No check-ins yet.');
  }

  const effectiveStart = firstEverCheckinDate > window.startDate ? firstEverCheckinDate : window.startDate;
  const effectiveDays = Math.max(
    1,
    Math.round(
      (new Date(`${window.endDate}T00:00:00Z`).getTime() - new Date(`${effectiveStart}T00:00:00Z`).getTime()) /
        86_400_000
    ) + 1
  );

  const daysLogged = new Set(
    checkins.filter((c) => c.local_date >= effectiveStart && c.local_date <= window.endDate).map((c) => c.local_date)
  ).size;

  const score = Math.min(100, Math.round((daysLogged / effectiveDays) * 100));
  const { level } = coverageConfidence(daysLogged, effectiveDays);

  return {
    domain: 'consistency',
    label: DOMAIN_LABEL.consistency,
    score,
    confidence_level: level,
    direction: 'unknown',
    data_points: daysLogged,
    window_days: effectiveDays,
    explanation: `Checked in ${daysLogged} of the last ${effectiveDays} day${effectiveDays === 1 ? '' : 's'}.`,
  };
}
