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

  /**
   * Off-by-one fix (2026-07-28): "Today's forecast" cards showed a gap
   * one point off from what their own labels said (e.g. Exhausted->Low
   * captioned "2 points higher"; Low->Low captioned "1 point higher"
   * instead of an exact match). The real defect was a frozen DB `gap`
   * disagreeing with a freshly re-read actual value after an edited
   * check-in (see the "revised check-in answer" integration test and
   * service.ts's resolveScoredView) — this function itself was already
   * correct, but these cases are pinned explicitly per the task's own
   * requirement: exact match, one step in each direction, and the
   * five-step scale's maximum possible gap.
   */
  it('exact match: predicted level equals actual level -> gap 0', () => {
    expect(scoreForecast(2, 2)).toEqual({ gap: 0, withinTolerance: true });
  });

  it('one step higher than predicted (e.g. Exhausted(1) -> Low(2)) -> gap 1, not 2', () => {
    expect(scoreForecast(1, 2)).toEqual({ gap: 1, withinTolerance: true });
  });

  it('one step lower than predicted (e.g. Good(4) -> Moderate(3)) -> gap -1', () => {
    expect(scoreForecast(4, 3)).toEqual({ gap: -1, withinTolerance: true });
  });

  it('the maximum possible gap on the five-step scale: Exhausted(1) predicted, High(5) actual -> gap 4', () => {
    expect(scoreForecast(1, 5)).toEqual({ gap: 4, withinTolerance: false });
    expect(scoreForecast(5, 1)).toEqual({ gap: -4, withinTolerance: false });
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
