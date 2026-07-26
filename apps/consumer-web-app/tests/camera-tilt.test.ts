import { describe, it, expect } from 'vitest';
import { evaluateCameraTilt } from '../lib/body-assessment/cameraTilt';

describe('evaluateCameraTilt', () => {
  it('passes when no orientation reading is available (graceful degradation)', () => {
    expect(evaluateCameraTilt(null).ok).toBe(true);
  });

  it('passes when the phone is level, within the +/-1 degree reproducibility tolerance', () => {
    expect(evaluateCameraTilt(0).ok).toBe(true);
    expect(evaluateCameraTilt(0.5).ok).toBe(true);
    expect(evaluateCameraTilt(-0.9).ok).toBe(true);
  });

  it('fails when roll is even slightly past the +/-1 degree tolerance, in either direction', () => {
    expect(evaluateCameraTilt(1.1).ok).toBe(false);
    expect(evaluateCameraTilt(-1.1).ok).toBe(false);
    expect(evaluateCameraTilt(20).ok).toBe(false);
    expect(evaluateCameraTilt(-20).ok).toBe(false);
  });

  it('returns a speakable message on failure', () => {
    const result = evaluateCameraTilt(30);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('ignores beta when not supplied (backward compatible)', () => {
    expect(evaluateCameraTilt(0).ok).toBe(true);
  });

  it('passes a phone within +/-2 degrees of perfectly vertical (beta near 90)', () => {
    expect(evaluateCameraTilt(0, 90).ok).toBe(true);
    expect(evaluateCameraTilt(0, 88.5).ok).toBe(true);
    expect(evaluateCameraTilt(0, 91.9).ok).toBe(true);
  });

  it('fails when pitch is past the +/-2 degree vertical tolerance, in either direction', () => {
    expect(evaluateCameraTilt(0, 87.5).ok).toBe(false);
    expect(evaluateCameraTilt(0, 92.5).ok).toBe(false);
    expect(evaluateCameraTilt(0, 20).ok).toBe(false);
    expect(evaluateCameraTilt(0, 170).ok).toBe(false);
  });

  it('passes beta=null even when gamma is null (graceful degradation on both axes)', () => {
    expect(evaluateCameraTilt(null, null).ok).toBe(true);
  });
});
