/**
 * Root's own forecast — pure, no I/O. A simple, honest, fully-auditable
 * basis: the rolling mean of her most recent real energy_level values,
 * rounded to the nearest whole point on the same 1-5 scale, optionally
 * nudged by one point when a driver relationship the correlation engine
 * has genuinely earned for her account points clearly one way. Never a
 * fabricated or "smart" number — every input is a value she actually
 * logged, and basisObservationCount always reports exactly how many.
 *
 * Root abstains — produces no forecast at all — in two distinct cases,
 * both "no genuine basis" rather than a forced guess:
 *   - too few real values yet (`insufficient_history`)
 *   - enough values, but they swing too wildly to have a stable center to
 *     call (`too_volatile`) — e.g. alternating between the scale's
 *     extremes. A forecast built on that isn't a real call, it's a coin
 *     flip dressed up as one.
 */
import {
  ROOT_FORECAST_MIN_HISTORY_DAYS,
  ROOT_FORECAST_WINDOW_DAYS,
  ROOT_FORECAST_MAX_VOLATILITY,
} from './constants';

export type RootForecastResult =
  | { kind: 'insufficient_history'; basisObservationCount: number }
  | { kind: 'too_volatile'; basisObservationCount: number; volatility: number }
  | {
      kind: 'forecast';
      predictedEnergyLevel: number;
      basisObservationCount: number;
      method: 'recent_average' | 'recent_average_with_driver_nudge';
      nudgeDriverLabel?: string;
      nudgeDirection?: 'positive' | 'negative';
    };

export type DriverNudgeInput = {
  driverLabel: string;
  direction: 'positive' | 'negative';
  /** Real values of the driver variable, oldest first, ending with the most recent night she logged one — same-length real data, never interpolated. */
  values: readonly number[];
};

function average(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Population standard deviation — deliberately the population (not sample) form since this is describing "how spread out are these exact values," not estimating a wider population. */
function populationStdDev(values: readonly number[], mean: number): number {
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * -1, 0, or +1: whether her most recent real value of an earned driver sits
 * clearly (>1 standard deviation from her own average for that driver)
 * above or below her own norm, translated through the correlation's earned
 * direction. Anything less clear-cut than 1 SD is treated as "no real
 * signal today" and nudges nothing — this is a single-point nudge, never a
 * bigger swing, so Root's own forecast stays legible as "the average, plus
 * a nudge," not a re-derived number.
 */
export function computeDriverNudge(input: DriverNudgeInput): -1 | 0 | 1 {
  const { values, direction } = input;
  if (values.length < ROOT_FORECAST_MIN_HISTORY_DAYS) return 0;

  const mean = average(values);
  const sd = populationStdDev(values, mean);
  if (sd === 0) return 0;

  const last = values[values.length - 1]!;
  const z = (last - mean) / sd;
  if (Math.abs(z) < 1) return 0;

  const driverIsHigh = z > 0;
  const pushEnergyUp = direction === 'positive' ? driverIsHigh : !driverIsHigh;
  return pushEnergyUp ? 1 : -1;
}

/** `history` is every real (non-null) energy_level value she has, oldest first. `driverNudge`, if provided, is her genuinely-earned check-in driver relationship (see data.ts's getEnergyDriverBasis) — omitted entirely (not just null-valued) when no such relationship exists yet, so Root's method never claims a nudge it didn't apply. */
export function computeRootForecast(
  history: readonly number[],
  driverNudge?: DriverNudgeInput | null
): RootForecastResult {
  if (history.length < ROOT_FORECAST_MIN_HISTORY_DAYS) {
    return { kind: 'insufficient_history', basisObservationCount: history.length };
  }

  const window = history.slice(-ROOT_FORECAST_WINDOW_DAYS);
  const mean = average(window);
  const volatility = populationStdDev(window, mean);

  if (volatility > ROOT_FORECAST_MAX_VOLATILITY) {
    return { kind: 'too_volatile', basisObservationCount: window.length, volatility };
  }

  const baseline = Math.min(5, Math.max(1, Math.round(mean)));
  const nudge = driverNudge ? computeDriverNudge(driverNudge) : 0;

  if (nudge === 0) {
    return {
      kind: 'forecast',
      predictedEnergyLevel: baseline,
      basisObservationCount: window.length,
      method: 'recent_average',
    };
  }

  return {
    kind: 'forecast',
    predictedEnergyLevel: Math.min(5, Math.max(1, baseline + nudge)),
    basisObservationCount: window.length,
    method: 'recent_average_with_driver_nudge',
    nudgeDriverLabel: driverNudge!.driverLabel,
    nudgeDirection: driverNudge!.direction,
  };
}
