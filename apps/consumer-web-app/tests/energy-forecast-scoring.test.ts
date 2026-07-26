import { describe, it, expect } from 'vitest';
import { scoreForecast, accuracyPercent, meetsCalibrationThreshold } from '../lib/energy-forecast/scoring';
import { MIN_SCORED_FORECASTS_FOR_CALIBRATION, ACCURACY_TOLERANCE } from '../lib/energy-forecast/constants';

describe('scoreForecast', () => {
  it('computes a signed gap: actual minus predicted', () => {
    expect(scoreForecast(3, 5)).toEqual({ gap: 2, withinTolerance: false });
    expect(scoreForecast(5, 3)).toEqual({ gap: -2, withinTolerance: false });
    expect(scoreForecast(3, 3)).toEqual({ gap: 0, withinTolerance: true });
  });

  it('is within tolerance at exactly the configured boundary, not one point past it', () => {
    expect(scoreForecast(3, 3 + ACCURACY_TOLERANCE).withinTolerance).toBe(true);
    expect(scoreForecast(3, 3 + ACCURACY_TOLERANCE + 1).withinTolerance).toBe(false);
  });
});

describe('accuracyPercent', () => {
  it('is the real percentage of gaps within tolerance, never a fabricated number', () => {
    expect(accuracyPercent([0, 0, 0, 0])).toBe(100);
    expect(accuracyPercent([0, 3, 0, 3])).toBe(50);
    expect(accuracyPercent([])).toBe(0);
  });
});

describe('meetsCalibrationThreshold — the "no chart / no percentage from too few results" gate', () => {
  it('is false below the configured minimum', () => {
    expect(meetsCalibrationThreshold(MIN_SCORED_FORECASTS_FOR_CALIBRATION - 1)).toBe(false);
    expect(meetsCalibrationThreshold(0)).toBe(false);
    expect(meetsCalibrationThreshold(1)).toBe(false);
  });

  it('is true at and above the configured minimum', () => {
    expect(meetsCalibrationThreshold(MIN_SCORED_FORECASTS_FOR_CALIBRATION)).toBe(true);
    expect(meetsCalibrationThreshold(MIN_SCORED_FORECASTS_FOR_CALIBRATION + 5)).toBe(true);
  });
});
