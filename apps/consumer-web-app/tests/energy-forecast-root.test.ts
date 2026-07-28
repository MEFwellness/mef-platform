import { describe, it, expect } from 'vitest';
import { computeRootForecast, computeDriverNudge } from '../lib/energy-forecast/rootForecast';
import {
  ROOT_FORECAST_MIN_HISTORY_DAYS,
  ROOT_FORECAST_WINDOW_DAYS,
  ROOT_FORECAST_MAX_VOLATILITY,
} from '../lib/energy-forecast/constants';

describe('computeRootForecast — "Root must NOT forecast until it has a genuine basis"', () => {
  it('never produces a forecast from nothing', () => {
    expect(computeRootForecast([])).toEqual({ kind: 'insufficient_history', basisObservationCount: 0 });
  });

  it('refuses to forecast below the configured minimum history', () => {
    const almostEnough = Array(ROOT_FORECAST_MIN_HISTORY_DAYS - 1).fill(4);
    const result = computeRootForecast(almostEnough);
    expect(result.kind).toBe('insufficient_history');
    expect(result.basisObservationCount).toBe(almostEnough.length);
  });

  it('forecasts once the minimum is exactly met', () => {
    const justEnough = Array(ROOT_FORECAST_MIN_HISTORY_DAYS).fill(4);
    const result = computeRootForecast(justEnough);
    expect(result.kind).toBe('forecast');
    if (result.kind !== 'forecast') throw new Error('expected forecast');
    expect(result.predictedEnergyLevel).toBe(4);
    expect(result.basisObservationCount).toBe(ROOT_FORECAST_MIN_HISTORY_DAYS);
    expect(result.method).toBe('recent_average');
  });

  it('reports the real observation count it actually used, capped at the rolling window', () => {
    const longHistory = [3, 4, 3, 4, 3, 4, 3, 4, 3, 4]; // 10 stable values, more than the window
    const result = computeRootForecast(longHistory);
    expect(result.kind).toBe('forecast');
    if (result.kind !== 'forecast') throw new Error('expected forecast');
    expect(result.basisObservationCount).toBe(ROOT_FORECAST_WINDOW_DAYS);
  });

  it('rounds the rolling mean to the nearest whole point on the 1-5 scale', () => {
    const a = computeRootForecast([1, 2, 2]);
    expect(a.kind).toBe('forecast');
    if (a.kind === 'forecast') expect(a.predictedEnergyLevel).toBe(2); // mean 1.667 -> 2

    const b = computeRootForecast([5, 5, 4]);
    expect(b.kind).toBe('forecast');
    if (b.kind === 'forecast') expect(b.predictedEnergyLevel).toBe(5); // mean 4.667 -> 5
  });

  it('clamps to the 1-5 scale even at the theoretical edges', () => {
    const a = computeRootForecast([1, 1, 1]);
    if (a.kind === 'forecast') expect(a.predictedEnergyLevel).toBeGreaterThanOrEqual(1);
    const b = computeRootForecast([5, 5, 5]);
    if (b.kind === 'forecast') expect(b.predictedEnergyLevel).toBeLessThanOrEqual(5);
  });
});

describe('computeRootForecast — erratic-history abstention ("too_volatile")', () => {
  it('abstains when recent history swings between the scale extremes', () => {
    const wild = [1, 5, 1, 5, 1, 5, 1];
    const result = computeRootForecast(wild);
    expect(result.kind).toBe('too_volatile');
    if (result.kind === 'too_volatile') {
      expect(result.basisObservationCount).toBe(Math.min(wild.length, ROOT_FORECAST_WINDOW_DAYS));
      expect(result.volatility).toBeGreaterThan(ROOT_FORECAST_MAX_VOLATILITY);
    }
  });

  it('does not abstain on ordinary, mild day-to-day variation', () => {
    const mild = [3, 4, 3, 4, 3, 4, 3];
    const result = computeRootForecast(mild);
    expect(result.kind).toBe('forecast');
  });

  it('a too_volatile abstention is never counted as a hit or a miss — it writes no forecast at all, so there is nothing to score', () => {
    const wild = [1, 5, 1, 5, 1, 5, 1];
    const result = computeRootForecast(wild);
    // The only way this could ever be scored is if it were 'forecast' kind
    // and a row got written for it — confirm the abstention path can never
    // reach that branch's shape.
    expect(result.kind).not.toBe('forecast');
  });
});

describe('computeDriverNudge — the earned-relationship adjustment', () => {
  it('does not nudge with too little driver history', () => {
    expect(computeDriverNudge({ driverLabel: 'Sleep quality', direction: 'positive', values: [3, 2] })).toBe(0);
  });

  it('nudges up when a positively-correlated driver is clearly above her own norm last night', () => {
    const values = [3, 3, 3, 3, 3, 3, 5]; // last value is a clear high outlier
    expect(computeDriverNudge({ driverLabel: 'Sleep quality', direction: 'positive', values })).toBe(1);
  });

  it('nudges down when a positively-correlated driver is clearly below her own norm last night', () => {
    const values = [3, 3, 3, 3, 3, 3, 1];
    expect(computeDriverNudge({ driverLabel: 'Sleep quality', direction: 'positive', values })).toBe(-1);
  });

  it('inverts for a negatively-correlated driver', () => {
    const values = [3, 3, 3, 3, 3, 3, 5]; // high stress last night, stress is negatively correlated with energy
    expect(computeDriverNudge({ driverLabel: 'Stress', direction: 'negative', values })).toBe(-1);
  });

  it('does not nudge when last night is unremarkable relative to her own norm', () => {
    const values = [3, 4, 3, 4, 3, 4, 3];
    expect(computeDriverNudge({ driverLabel: 'Sleep quality', direction: 'positive', values })).toBe(0);
  });

  it('does not nudge when the driver has had no real variation at all (zero standard deviation)', () => {
    const values = [3, 3, 3, 3, 3];
    expect(computeDriverNudge({ driverLabel: 'Sleep quality', direction: 'positive', values })).toBe(0);
  });
});

describe('computeRootForecast — the driver nudge composed with the baseline', () => {
  it('shifts the baseline exactly one point in the earned direction when applicable, and reports the driver-nudge method', () => {
    const history = [3, 3, 3, 3, 3, 3, 3]; // stable baseline of 3
    const driverValues = [3, 3, 3, 3, 3, 3, 5]; // last-night driver spike
    const result = computeRootForecast(history, { driverLabel: 'Sleep quality', direction: 'positive', values: driverValues });
    expect(result.kind).toBe('forecast');
    if (result.kind !== 'forecast') throw new Error('expected forecast');
    expect(result.predictedEnergyLevel).toBe(4);
    expect(result.method).toBe('recent_average_with_driver_nudge');
    expect(result.nudgeDriverLabel).toBe('Sleep quality');
    expect(result.nudgeDirection).toBe('positive');
  });

  it('never nudges past the 1-5 scale', () => {
    const history = [5, 5, 5, 5, 5, 5, 5];
    const driverValues = [3, 3, 3, 3, 3, 3, 5];
    const result = computeRootForecast(history, { driverLabel: 'Sleep quality', direction: 'positive', values: driverValues });
    expect(result.kind).toBe('forecast');
    if (result.kind === 'forecast') expect(result.predictedEnergyLevel).toBeLessThanOrEqual(5);
  });

  it('falls back to the plain recent-average method when no driver nudge is supplied', () => {
    const result = computeRootForecast([3, 3, 3], null);
    expect(result.kind).toBe('forecast');
    if (result.kind === 'forecast') {
      expect(result.method).toBe('recent_average');
      expect(result.nudgeDriverLabel).toBeUndefined();
    }
  });
});
