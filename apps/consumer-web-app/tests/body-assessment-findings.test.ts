import { describe, it, expect } from 'vitest';
import {
  FINDING_TYPE_CONFIG,
  ALL_FINDING_TYPES,
  isConcerningFinding,
  SEVERITY_RANK,
} from '../lib/body-assessment/findings';

describe('FINDING_TYPE_CONFIG', () => {
  it('defines all eleven standardized findings plus custom, per the milestone brief', () => {
    const expected = [
      'forward_head',
      'rounded_shoulders',
      'elevated_shoulder',
      'pelvic_tilt',
      'thoracic_kyphosis',
      'lumbar_posture',
      'knee_valgus',
      'foot_turnout',
      'weight_shift',
      'breathing_pattern',
      'hip_asymmetry',
      'custom',
    ];
    expect(ALL_FINDING_TYPES.sort()).toEqual(expected.sort());
  });

  it('every finding type has a non-empty label and description', () => {
    for (const type of ALL_FINDING_TYPES) {
      expect(FINDING_TYPE_CONFIG[type].label.length).toBeGreaterThan(0);
      expect(FINDING_TYPE_CONFIG[type].description.length).toBeGreaterThan(0);
    }
  });
});

describe('SEVERITY_RANK', () => {
  it('is monotonically increasing from none to significant', () => {
    expect(SEVERITY_RANK.none).toBeLessThan(SEVERITY_RANK.mild);
    expect(SEVERITY_RANK.mild).toBeLessThan(SEVERITY_RANK.moderate);
    expect(SEVERITY_RANK.moderate).toBeLessThan(SEVERITY_RANK.significant);
  });
});

describe('isConcerningFinding', () => {
  it('is true only for significant severity at or above the confidence threshold', () => {
    expect(isConcerningFinding('significant', 0.6)).toBe(true);
    expect(isConcerningFinding('significant', 0.9)).toBe(true);
  });

  it('is false for significant severity below the confidence threshold', () => {
    expect(isConcerningFinding('significant', 0.59)).toBe(false);
  });

  it('is false for any non-significant severity regardless of confidence', () => {
    expect(isConcerningFinding('moderate', 0.99)).toBe(false);
    expect(isConcerningFinding('mild', 1)).toBe(false);
    expect(isConcerningFinding('none', 1)).toBe(false);
    expect(isConcerningFinding('unknown', 1)).toBe(false);
  });
});
