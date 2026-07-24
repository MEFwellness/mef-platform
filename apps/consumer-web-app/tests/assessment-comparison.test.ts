import { describe, it, expect } from 'vitest';
import { classifyComparison } from '../lib/assessment-comparison/classify';
import {
  fromOnboardingDirection,
  fromBodyAssessmentTrend,
  fromQuestionnaireEngineDirection,
} from '../lib/assessment-comparison/adapters';

describe('classifyComparison', () => {
  it('returns null when neither side has data', () => {
    expect(classifyComparison({ previousRank: null, currentRank: null })).toBeNull();
  });

  it('returns "new" when there is no previous data point but a current one exists', () => {
    expect(classifyComparison({ previousRank: null, currentRank: 2 })).toBe('new');
  });

  it('returns "resolved" when a previous data point existed but the current one is absent', () => {
    expect(classifyComparison({ previousRank: 2, currentRank: null })).toBe('resolved');
  });

  it('returns "unchanged" when both ranks are equal', () => {
    expect(classifyComparison({ previousRank: 1, currentRank: 1 })).toBe('unchanged');
  });

  it('treats a higher rank as worse by default', () => {
    expect(classifyComparison({ previousRank: 1, currentRank: 2 })).toBe('worsened');
    expect(classifyComparison({ previousRank: 2, currentRank: 1 })).toBe('improved');
  });

  it('inverts direction when higherIsWorse is false', () => {
    expect(classifyComparison({ previousRank: 1, currentRank: 2, higherIsWorse: false })).toBe('improved');
    expect(classifyComparison({ previousRank: 2, currentRank: 1, higherIsWorse: false })).toBe('worsened');
  });
});

describe('fromOnboardingDirection', () => {
  it('maps improved/declined/stable/null to the canonical vocabulary', () => {
    expect(fromOnboardingDirection('improved')).toBe('improved');
    expect(fromOnboardingDirection('declined')).toBe('worsened');
    expect(fromOnboardingDirection('stable')).toBe('unchanged');
    expect(fromOnboardingDirection(null)).toBeNull();
  });
});

describe('fromBodyAssessmentTrend', () => {
  it('maps improved/declined/stable/unknown to the canonical vocabulary', () => {
    expect(fromBodyAssessmentTrend('improved')).toBe('improved');
    expect(fromBodyAssessmentTrend('declined')).toBe('worsened');
    expect(fromBodyAssessmentTrend('stable')).toBe('unchanged');
    expect(fromBodyAssessmentTrend('unknown')).toBeNull();
  });
});

describe('fromQuestionnaireEngineDirection', () => {
  it('maps improved/regressed/unchanged/unknown to the canonical vocabulary', () => {
    expect(fromQuestionnaireEngineDirection('improved')).toBe('improved');
    expect(fromQuestionnaireEngineDirection('regressed')).toBe('worsened');
    expect(fromQuestionnaireEngineDirection('unchanged')).toBe('unchanged');
    expect(fromQuestionnaireEngineDirection('unknown')).toBeNull();
  });
});
