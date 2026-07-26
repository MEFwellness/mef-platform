import { describe, it, expect } from 'vitest';
import { computeRootForecast } from '../lib/energy-forecast/rootForecast';
import { ROOT_FORECAST_MIN_HISTORY_DAYS, ROOT_FORECAST_WINDOW_DAYS } from '../lib/energy-forecast/constants';

describe('computeRootForecast — "Root must NOT forecast until it has a genuine basis"', () => {
  it('never produces a forecast from nothing', () => {
    expect(computeRootForecast([])).toBeNull();
  });

  it('refuses to forecast below the configured minimum history', () => {
    const almostEnough = Array(ROOT_FORECAST_MIN_HISTORY_DAYS - 1).fill(4);
    expect(computeRootForecast(almostEnough)).toBeNull();
  });

  it('forecasts once the minimum is exactly met', () => {
    const justEnough = Array(ROOT_FORECAST_MIN_HISTORY_DAYS).fill(4);
    const result = computeRootForecast(justEnough);
    expect(result).not.toBeNull();
    expect(result!.predictedEnergyLevel).toBe(4);
    expect(result!.basisObservationCount).toBe(ROOT_FORECAST_MIN_HISTORY_DAYS);
  });

  it('reports the real observation count it actually used, capped at the rolling window', () => {
    const longHistory = [1, 2, 3, 4, 5, 4, 3, 2, 1, 5]; // 10 values, more than the window
    const result = computeRootForecast(longHistory)!;
    expect(result.basisObservationCount).toBe(ROOT_FORECAST_WINDOW_DAYS);
  });

  it('rounds the rolling mean to the nearest whole point on the 1-5 scale', () => {
    expect(computeRootForecast([1, 2, 2])!.predictedEnergyLevel).toBe(2); // mean 1.667 -> 2
    expect(computeRootForecast([5, 5, 4])!.predictedEnergyLevel).toBe(5); // mean 4.667 -> 5
  });

  it('clamps to the 1-5 scale even at the theoretical edges', () => {
    expect(computeRootForecast([1, 1, 1])!.predictedEnergyLevel).toBeGreaterThanOrEqual(1);
    expect(computeRootForecast([5, 5, 5])!.predictedEnergyLevel).toBeLessThanOrEqual(5);
  });
});
