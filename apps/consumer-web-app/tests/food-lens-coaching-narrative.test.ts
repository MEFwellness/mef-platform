import { describe, it, expect } from 'vitest';
import { buildDeterministicFallbackNarrative } from '../lib/food-lens/coachingNarrative';
import type { FoodLensComparisonSignal } from '@mef/shared-types-contracts';

function signal(overrides: Partial<FoodLensComparisonSignal> = {}): FoodLensComparisonSignal {
  return {
    dimension: 'protein',
    mealLevel: 'low',
    targetLevel: 'moderate',
    direction: 'light',
    ...overrides,
  };
}

describe('buildDeterministicFallbackNarrative', () => {
  // Regression test: this is the path a live Playwright run against this
  // repo's own local dev environment actually exercises whenever
  // ANTHROPIC_API_KEY isn't set (getConversationCoachProvider() returns
  // null) — not a rare edge case. It used to build its pattern phrase as
  // `your ${patternLabel} pattern`, which doubled the word for the
  // default label exactly like the caption bug this task was asked to fix.
  it('regression: never doubles "pattern" for the default label "My Eating Pattern"', () => {
    const narrative = buildDeterministicFallbackNarrative(
      [signal({ dimension: 'protein', direction: 'light' })],
      'My Eating Pattern'
    );
    expect(narrative).not.toMatch(/pattern pattern/i);
    expect(narrative).toContain('your My Eating Pattern');
  });

  it('appends "pattern" for a custom label that does not already end with it', () => {
    const narrative = buildDeterministicFallbackNarrative(
      [signal({ dimension: 'protein', direction: 'light' })],
      'Keto'
    );
    expect(narrative).toContain('your Keto pattern');
  });

  it('falls back to "your eating pattern" when there is no label at all', () => {
    const narrative = buildDeterministicFallbackNarrative(
      [signal({ dimension: 'protein', direction: 'light' })],
      null
    );
    expect(narrative).toContain('your eating pattern');
  });

  it('reads as a match when every signal matches', () => {
    const narrative = buildDeterministicFallbackNarrative(
      [signal({ direction: 'match' }), signal({ dimension: 'carb', direction: 'match' })],
      'My Eating Pattern'
    );
    expect(narrative).toContain('solid match for your My Eating Pattern');
  });
});
