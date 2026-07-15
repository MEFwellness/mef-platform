import { describe, it, expect } from 'vitest';
import { computePelvicDropScreening, type PelvicDropSample } from '../lib/body-assessment/pelvicDropScreening';

function samplesAt(angles: number[], confidence = 0.9): PelvicDropSample[] {
  return angles.map((hipLineAngle, i) => ({ hipLineAngle, confidence, timestampMs: i * 100 }));
}

describe('computePelvicDropScreening', () => {
  it('returns null with too few samples to be meaningful', () => {
    expect(computePelvicDropScreening(samplesAt([0, 0, 0]))).toBeNull();
  });

  it('reports no indicator for a level, stable hip line throughout', () => {
    const result = computePelvicDropScreening(samplesAt([0, 0.5, -0.5, 0, 0.3, -0.2, 0, 0.1]))!;
    expect(result.narrative).toMatch(/no pelvic-drop screening indicator/i);
  });

  it('flags a screening indicator when the hip line deviates well past the baseline', () => {
    const angles = [0, 0.2, 0.1, 0, 7, 7.5, 8, 7, 0.2, 0];
    const result = computePelvicDropScreening(samplesAt(angles))!;
    expect(result.maxDeviationDegrees).toBeGreaterThan(4);
    expect(result.narrative).toMatch(/pelvic-drop screening indicator/i);
    // The disclaimer explicitly negating a diagnosis is required wording,
    // not itself a diagnostic claim — assert the safe phrasing is present.
    expect(result.narrative).toMatch(/not a trendelenburg diagnosis/i);
  });

  it('lowers confidence when landmark visibility is poor throughout the trial', () => {
    const angles = [0, 1, 6, 6, 1, 0];
    const confident = computePelvicDropScreening(samplesAt(angles, 0.95))!;
    const unconfident = computePelvicDropScreening(samplesAt(angles, 0.3))!;
    expect(unconfident.confidence).toBeLessThan(confident.confidence);
  });

  it('lowers confidence when samples jump erratically (instability/rotation proxy)', () => {
    const stable = samplesAt([0, 1, 2, 3, 4, 5, 6, 5]);
    const erratic: PelvicDropSample[] = [0, 15, 2, 18, 4, 20, 1, 17].map((hipLineAngle, i) => ({
      hipLineAngle,
      confidence: 0.9,
      timestampMs: i * 100,
    }));
    const stableResult = computePelvicDropScreening(stable)!;
    const erraticResult = computePelvicDropScreening(erratic)!;
    expect(erraticResult.confidence).toBeLessThan(stableResult.confidence);
  });

  it('never mentions a diagnosis, only a screening indicator', () => {
    const result = computePelvicDropScreening(samplesAt([0, 8, 9, 10, 8, 0]))!;
    expect(result.narrative).not.toMatch(/you have|diagnosis of trendelenburg/i);
  });
});
