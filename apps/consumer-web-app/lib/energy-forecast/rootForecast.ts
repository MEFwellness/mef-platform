/**
 * Root's own forecast — pure, no I/O. A simple, honest, fully-auditable
 * basis: the rolling mean of her most recent real energy_level values,
 * rounded to the nearest whole point on the same 1-5 scale. Never a
 * fabricated or "smart" number — every input is a value she actually
 * logged, and basisObservationCount always reports exactly how many.
 *
 * Returns null when there isn't yet a genuine basis to forecast from
 * (requirement: "Root must NOT forecast until it has a genuine basis").
 */
import { ROOT_FORECAST_MIN_HISTORY_DAYS, ROOT_FORECAST_WINDOW_DAYS } from './constants';

export type RootForecastBasis = {
  predictedEnergyLevel: number;
  basisObservationCount: number;
};

/** `history` is every real (non-null) energy_level value she has, oldest first. */
export function computeRootForecast(history: readonly number[]): RootForecastBasis | null {
  if (history.length < ROOT_FORECAST_MIN_HISTORY_DAYS) return null;

  const window = history.slice(-ROOT_FORECAST_WINDOW_DAYS);
  const mean = window.reduce((sum, v) => sum + v, 0) / window.length;
  const predicted = Math.min(5, Math.max(1, Math.round(mean)));

  return { predictedEnergyLevel: predicted, basisObservationCount: window.length };
}
