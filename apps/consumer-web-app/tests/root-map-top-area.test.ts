/**
 * Guard tests for Part 6 — "What We're Noticing Overall" must name a
 * real area, or hide the recommendation entirely rather than showing the
 * old unnamed "there's a specific area worth exploring further."
 */
import { describe, it, expect } from 'vitest';
import { resolveNamedAreaRecommendation } from '../lib/root-map/topArea';
import type { RootMapDomainView } from '../lib/root-map/types';
import type { RootRouterOutcomeView } from '../lib/investigation-engine/routerOutcome';

function domainView(overrides: Partial<RootMapDomainView> = {}): RootMapDomainView {
  return {
    domain: 'sleep_circadian_rhythm',
    label: 'Sleep & Circadian Rhythm',
    definition: 'Sleep quality, timing, and consistency; circadian alignment.',
    memberDescription: 'How well you sleep, when you sleep, and whether your body clock is running on time.',
    isUninstrumented: false,
    stage: 'discovery',
    state: 'acknowledged',
    tier: null,
    tierLabel: null,
    canonicalFindings: [],
    crossReferenced: [],
    confidence: { label: 'low', numeric: 0.3, corroborated: false },
    priority: 'quiet',
    whatWeUnderstand: [],
    whatWereStillLearning: "We're building a clearer picture here as more information comes in.",
    currentRecommendation: 'Looking steady',
    nextSuggestedStep: 'Nothing specific needed here right now.',
    patterns: [],
    ...overrides,
  };
}

const INVESTIGATION = {
  key: 'four-doctors' as const,
  displayName: 'Four Doctors Assessment',
  reason: 'recommended_next' as const,
  route: '/assessments/four-doctors',
};

function outcome(overrides: Partial<RootRouterOutcomeView> = {}): RootRouterOutcomeView {
  return {
    outcome: 'focused_investigation',
    memberMessage: "There's a specific area worth exploring further with a short assessment.",
    investigation: INVESTIGATION,
    ...overrides,
  };
}

describe('resolveNamedAreaRecommendation', () => {
  it('names the top-priority domain when a genuine standout exists', () => {
    const stress = domainView({
      domain: 'stress_nervous_system',
      label: 'Stress & Nervous System Regulation',
      priority: 'needs_attention_now',
    });
    const sleep = domainView({ priority: 'quiet' });

    const result = resolveNamedAreaRecommendation(outcome(), [stress, sleep]);
    expect(result).toEqual({ areaLabel: 'Stress & Nervous System Regulation', investigation: INVESTIGATION });
  });

  it('hides the recommendation when the top domain is not a real standout (every domain quiet)', () => {
    const result = resolveNamedAreaRecommendation(outcome(), [domainView({ priority: 'quiet' })]);
    expect(result).toBeNull();
  });

  it('does not fire for any outcome other than focused_investigation', () => {
    const result = resolveNamedAreaRecommendation(
      outcome({ outcome: 'reflection', memberMessage: 'Worth a quick moment of reflection.' }),
      [domainView({ priority: 'needs_attention_now' })]
    );
    expect(result).toBeNull();
  });

  it('returns null when there is no investigation to attach the name to', () => {
    const result = resolveNamedAreaRecommendation(outcome({ investigation: null }), [
      domainView({ priority: 'needs_attention_now' }),
    ]);
    expect(result).toBeNull();
  });
});
