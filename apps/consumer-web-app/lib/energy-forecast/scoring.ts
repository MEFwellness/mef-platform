/** Forecast & Calibration Loop — pure scoring math, no I/O. */
import { ACCURACY_TOLERANCE, MIN_SCORED_FORECASTS_FOR_CALIBRATION } from './constants';

export type ForecastScore = {
  gap: number; // actual - predicted, signed
  withinTolerance: boolean;
};

export function scoreForecast(predictedEnergyLevel: number, actualEnergyLevel: number): ForecastScore {
  const gap = actualEnergyLevel - predictedEnergyLevel;
  return { gap, withinTolerance: Math.abs(gap) <= ACCURACY_TOLERANCE };
}

/** Percentage of scored forecasts that landed within tolerance — callers gate display on MIN_SCORED_FORECASTS_FOR_CALIBRATION themselves; this just does the arithmetic. */
export function accuracyPercent(gaps: readonly number[]): number {
  if (gaps.length === 0) return 0;
  const hits = gaps.filter((gap) => Math.abs(gap) <= ACCURACY_TOLERANCE).length;
  return Math.round((hits / gaps.length) * 100);
}

/**
 * The single gate deciding whether a calibration percentage/chart may be
 * shown at all — "never display an accuracy percentage computed from too
 * few results." Both her count and Root's count must independently clear
 * this before the calibration section renders (see service.ts) — a small
 * count on either side means neither is shown, not a partial display.
 */
export function meetsCalibrationThreshold(scoredCount: number): boolean {
  return scoredCount >= MIN_SCORED_FORECASTS_FOR_CALIBRATION;
}
