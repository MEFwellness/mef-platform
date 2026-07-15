import { describe, it, expect } from 'vitest';
import { evaluateCameraTilt } from '../lib/body-assessment/cameraTilt';

describe('evaluateCameraTilt', () => {
  it('passes when no orientation reading is available (graceful degradation)', () => {
    expect(evaluateCameraTilt(null).ok).toBe(true);
  });

  it('passes when the phone is level', () => {
    expect(evaluateCameraTilt(0).ok).toBe(true);
    expect(evaluateCameraTilt(5).ok).toBe(true);
    expect(evaluateCameraTilt(-5).ok).toBe(true);
  });

  it('fails when the phone is tilted well past the screening bound, in either direction', () => {
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

  it('passes a phone standing vertical (beta near 90) or propped at a reasonable angle', () => {
    expect(evaluateCameraTilt(0, 90).ok).toBe(true);
    expect(evaluateCameraTilt(0, 60).ok).toBe(true);
    expect(evaluateCameraTilt(0, 120).ok).toBe(true);
  });

  it('fails when the phone is propped or laid at an extreme forward/backward angle', () => {
    expect(evaluateCameraTilt(0, 20).ok).toBe(false);
    expect(evaluateCameraTilt(0, 170).ok).toBe(false);
  });

  it('passes beta=null even when gamma is null (graceful degradation on both axes)', () => {
    expect(evaluateCameraTilt(null, null).ok).toBe(true);
  });
});
