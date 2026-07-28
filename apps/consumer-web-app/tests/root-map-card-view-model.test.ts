/**
 * Guard tests for Part 2 — the old card rendered "What We're Still
 * Learning" and a second recommendation box that said the same thing
 * whenever a domain had no findings yet. buildFindingCardViewModel is
 * what RootMapFindingCard.tsx renders directly; this asserts the state
 * message never appears twice in what the view model hands the
 * component, for both the common "gathering info" case and the
 * safety-suppressed case (the two states most likely to collide).
 */
import { describe, it, expect } from 'vitest';
import { buildFindingCardViewModel } from '../lib/root-map/cardViewModel';
import type { RootMapDomainView } from '../lib/root-map/types';

function domainView(overrides: Partial<RootMapDomainView> = {}): RootMapDomainView {
  return {
    domain: 'stress_nervous_system',
    label: 'Stress & Nervous System Regulation',
    definition: 'Perceived stress, regulation capacity, activation/recovery balance.',
    memberDescription: "How much pressure you're under, and how well you come down from it.",
    isUninstrumented: false,
    stage: 'stabilization',
    confidence: { label: 'moderate', numeric: 0.55, corroborated: true },
    priority: 'worth_watching',
    whatWeUnderstand: ['Stress has been elevated for the past two weeks.'],
    whatWereStillLearning: "We're building a clearer picture here as more information comes in.",
    currentRecommendation: 'Worth keeping an eye on',
    nextSuggestedStep: 'Keep tracking here — no urgent action needed yet.',
    patterns: [],
    ...overrides,
  };
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function renderedText(view: ReturnType<typeof buildFindingCardViewModel>): string {
  return [
    view.memberDescription,
    ...view.findings,
    view.stateMessage,
    view.nextStep ? `${view.nextStep.title} ${view.nextStep.body}` : '',
  ].join(' | ');
}

describe('buildFindingCardViewModel', () => {
  it('renders the state message exactly once for a normal finding domain', () => {
    const view = buildFindingCardViewModel(domainView(), null);
    expect(occurrences(renderedText(view), view.stateMessage)).toBe(1);
  });

  it('drops nextStep entirely (not just visually) when it would repeat stateMessage verbatim', () => {
    // The exact real-world collision: the safety-suppressed branch in
    // builder.ts sets whatWereStillLearning AND nextSuggestedStep to the
    // identical SAFETY_SUPPRESSED_MESSAGE string.
    const SAME_MESSAGE = 'Your coach is reviewing something in this area with you right now.';
    const suppressed = domainView({
      whatWereStillLearning: SAME_MESSAGE,
      currentRecommendation: 'Paused for coach review',
      nextSuggestedStep: SAME_MESSAGE,
    });

    const view = buildFindingCardViewModel(suppressed, null);
    expect(view.nextStep).toBeNull();
    expect(occurrences(renderedText(view), SAME_MESSAGE)).toBe(1);
  });

  it('keeps nextStep when it genuinely says something different from stateMessage', () => {
    const view = buildFindingCardViewModel(domainView(), null);
    expect(view.nextStep).toEqual({
      title: 'Worth keeping an eye on',
      body: 'Keep tracking here — no urgent action needed yet.',
    });
  });

  it('attaches the real coverage label when coverage is given, and nothing when it is not', () => {
    const withCoverage = buildFindingCardViewModel(domainView(), { count: 4, windowDays: 21 });
    expect(withCoverage.coverageLabel).toBe('4 of 21 days logged');

    const withoutCoverage = buildFindingCardViewModel(domainView(), null);
    expect(withoutCoverage.coverageLabel).toBeNull();
  });
});
