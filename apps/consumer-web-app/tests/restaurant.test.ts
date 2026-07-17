/**
 * Restaurant Intelligence (Food Lens Part 8) — unit tests for the
 * deterministic, no-I/O pieces: the menu-item heuristics
 * (lib/restaurant/menuItemHeuristics.ts) and the coaching narrative's
 * forbidden-phrase checker + deterministic fallback builder
 * (lib/restaurant/coachingNarrative.ts). Mirrors
 * tests/food-products-rules-engine.test.ts's style.
 *
 * generateRestaurantCoachingNarrative itself (the live-LLM path) isn't
 * exercised here — same call this app already made for
 * lib/food-products/coachingNarrative.ts, which has no equivalent unit
 * test file either. What's practically testable without a live provider
 * and a real Supabase session is exactly what's covered below.
 */
import { describe, it, expect } from 'vitest';
import { analyzeMenuItemHeuristics } from '../lib/restaurant/menuItemHeuristics';
import {
  buildDeterministicFallbackCoaching,
  containsForbiddenPhrase,
} from '../lib/restaurant/coachingNarrative';
import type { RestaurantMealAnalysis } from '@mef/shared-types-contracts';

describe('analyzeMenuItemHeuristics', () => {
  it('flags a fried/breaded preparation without calling it good or bad', () => {
    const result = analyzeMenuItemHeuristics({
      menuItemName: 'Crispy Fried Chicken Sandwich',
      description: 'Buttermilk-battered fried chicken, brioche bun, pickles, mayo.',
      rawMenuText: null,
      visualEstimateLabels: [],
    });
    expect(result.friedOrBreaded).toBe(true);
    expect(result.lighterPreparation).toBe(false);
    expect(result.observations.join(' ')).not.toMatch(/\bhealthy\b|\bunhealthy\b|\bgood\b|\bbad\b/i);
  });

  it('flags a lighter preparation for a grilled/vegetable-forward description, distinct from the fried item above', () => {
    const fried = analyzeMenuItemHeuristics({
      menuItemName: 'Crispy Fried Chicken Sandwich',
      description: 'Buttermilk-battered fried chicken, brioche bun, pickles, mayo.',
      rawMenuText: null,
      visualEstimateLabels: [],
    });
    const grilled = analyzeMenuItemHeuristics({
      menuItemName: 'Grilled Salmon Bowl',
      description: 'Grilled salmon over greens with roasted vegetables and quinoa.',
      rawMenuText: null,
      visualEstimateLabels: [],
    });
    expect(grilled.lighterPreparation).toBe(true);
    expect(grilled.friedOrBreaded).toBe(false);
    expect(grilled.vegetablesMentioned).toBe(true);
    expect(grilled.wholeGrainOrFiberMentioned).toBe(true);
    // Two different menu items with different descriptions must produce
    // genuinely different findings, not a one-size-fits-all result.
    expect(grilled.friedOrBreaded).not.toBe(fried.friedOrBreaded);
    expect(grilled.observations).not.toEqual(fried.observations);
  });

  it('recognizes a salad as an opportunity to ask for dressing on the side', () => {
    const result = analyzeMenuItemHeuristics({
      menuItemName: 'Cobb Salad',
      description: 'Mixed greens, bacon, egg, blue cheese, ranch dressing.',
      rawMenuText: null,
      visualEstimateLabels: [],
    });
    expect(result.saladWithPossibleDressing).toBe(true);
    expect(result.dressingOrSauceMentioned).toBe(true);
    expect(result.observations.join(' ')).toMatch(/dressing on the side/i);
  });

  it('reports no descriptive text when only a bare item name with no matching markers is given', () => {
    const result = analyzeMenuItemHeuristics({
      menuItemName: 'Special #3',
      description: null,
      rawMenuText: null,
      visualEstimateLabels: [],
    });
    expect(result.hasDescriptiveText).toBe(true); // a name was given
    expect(result.friedOrBreaded).toBe(false);
    expect(result.observations[0]).toMatch(/only a restaurant and item name/i);
  });

  it('folds in Food Lens visual-estimate labels as a clearly separate signal', () => {
    const result = analyzeMenuItemHeuristics({
      menuItemName: null,
      description: null,
      rawMenuText: null,
      visualEstimateLabels: ['fried chicken', 'french fries'],
    });
    expect(result.visualEstimateLabels).toEqual(['fried chicken', 'french fries']);
    expect(result.observations.join(' ')).toMatch(/visual estimate/i);
  });

  it('finds a lighter-prep alternative candidate literally present in the member\'s own pasted menu text, never inventing one', () => {
    const rawMenuText = [
      'Crispy Chicken Tenders - $12',
      'Grilled Salmon Plate - $18',
      'House Salad - $9',
    ].join('\n');
    const result = analyzeMenuItemHeuristics({
      menuItemName: 'Crispy Chicken Tenders',
      description: null,
      rawMenuText,
      visualEstimateLabels: [],
    });
    expect(result.alternativeCandidatesFromMenuText.length).toBeGreaterThan(0);
    expect(result.alternativeCandidatesFromMenuText.some((c) => c.includes('Grilled Salmon'))).toBe(
      true
    );
    // Never includes the item itself as its own "alternative".
    expect(
      result.alternativeCandidatesFromMenuText.some((c) => c.includes('Crispy Chicken Tenders'))
    ).toBe(false);
  });
});

describe('buildDeterministicFallbackCoaching', () => {
  it('never fabricates a specific calorie or gram value', () => {
    const heuristics = analyzeMenuItemHeuristics({
      menuItemName: 'Loaded Nachos',
      description: 'Tortilla chips, queso, ground beef, sour cream, jalapenos.',
      rawMenuText: null,
      visualEstimateLabels: [],
    });
    const result = buildDeterministicFallbackCoaching(heuristics, 'ingredient_estimate');
    const allText = [
      ...result.supportsYou,
      ...result.mindfulOf,
      ...result.modifications,
      ...result.pairings,
      ...result.betterFitAlternatives,
      result.portionGuidance ?? '',
    ].join(' ');
    expect(allText).not.toMatch(/\d+\s*(g\b|grams?|kcal|calories)/i);
  });

  it('threads estimate_basis through into the mindful-of section so the member always sees how much to trust it', () => {
    const heuristics = analyzeMenuItemHeuristics({
      menuItemName: 'Grilled Chicken Plate',
      description: 'Grilled chicken breast with steamed vegetables.',
      rawMenuText: null,
      visualEstimateLabels: [],
    });
    const visual = buildDeterministicFallbackCoaching(heuristics, 'visual_estimate');
    const memberEntered = buildDeterministicFallbackCoaching(heuristics, 'member_entered');
    expect(visual.mindfulOf.join(' ')).toMatch(/visual estimate/i);
    expect(memberEntered.mindfulOf.join(' ')).toMatch(/information you entered yourself/i);
    expect(visual.mindfulOf.join(' ')).not.toEqual(memberEntered.mindfulOf.join(' '));
  });

  it('suggests asking about a grilled/roasted version when the item is fried, never demonizing fried food outright', () => {
    const heuristics = analyzeMenuItemHeuristics({
      menuItemName: 'Fried Fish Basket',
      description: 'Beer-battered fried fish with french fries.',
      rawMenuText: null,
      visualEstimateLabels: [],
    });
    const result = buildDeterministicFallbackCoaching(heuristics, 'ingredient_estimate');
    expect(result.modifications.join(' ')).toMatch(/grilled|roasted|steamed/i);
    expect(containsForbiddenPhrase(result)).toBe(false);
  });

  it('surfaces a menu-text-derived alternative when one was found, and an honest "couldn\'t identify" line when none was', () => {
    const withAlternative = analyzeMenuItemHeuristics({
      menuItemName: 'Fried Fish Basket',
      description: 'Beer-battered fried fish.',
      rawMenuText: 'Fried Fish Basket - $14\nGrilled Chicken Salad - $11',
      visualEstimateLabels: [],
    });
    const withoutAlternative = analyzeMenuItemHeuristics({
      menuItemName: 'Fried Fish Basket',
      description: 'Beer-battered fried fish.',
      rawMenuText: null,
      visualEstimateLabels: [],
    });
    const resultWith = buildDeterministicFallbackCoaching(withAlternative, 'ingredient_estimate');
    const resultWithout = buildDeterministicFallbackCoaching(withoutAlternative, 'ingredient_estimate');
    expect(resultWith.betterFitAlternatives.some((a) => a.includes('Grilled Chicken Salad'))).toBe(
      true
    );
    expect(resultWithout.betterFitAlternatives.join(' ')).toMatch(/couldn't be identified/i);
  });

  it('never produces "healthy"/"unhealthy"/"good"/"bad" language anywhere in the fallback result', () => {
    const heuristics = analyzeMenuItemHeuristics({
      menuItemName: 'Double Bacon Cheeseburger',
      description: 'Loaded double cheeseburger with bacon and a creamy sauce.',
      rawMenuText: null,
      visualEstimateLabels: [],
    });
    const result = buildDeterministicFallbackCoaching(heuristics, 'member_entered');
    const allText = [
      ...result.supportsYou,
      ...result.mindfulOf,
      ...result.modifications,
      ...result.pairings,
      ...result.betterFitAlternatives,
      result.portionGuidance ?? '',
    ].join(' ');
    expect(allText).not.toMatch(/\bhealthy\b|\bunhealthy\b|\bgood\b|\bbad\b/i);
  });
});

describe('containsForbiddenPhrase', () => {
  it('flags a forbidden phrase if one ever slipped into a generated section', () => {
    const bad: RestaurantMealAnalysis = {
      supportsYou: ['This is a good food choice.'],
      mindfulOf: [],
      modifications: [],
      pairings: [],
      betterFitAlternatives: [],
      portionGuidance: null,
    };
    expect(containsForbiddenPhrase(bad)).toBe(true);
  });

  it('flags "this will cause" style absolute medical claims', () => {
    const bad: RestaurantMealAnalysis = {
      supportsYou: [],
      mindfulOf: ['This will cause problems later.'],
      modifications: [],
      pairings: [],
      betterFitAlternatives: [],
      portionGuidance: null,
    };
    expect(containsForbiddenPhrase(bad)).toBe(true);
  });

  it('does not flag ordinary, non-judgmental coaching language', () => {
    const fine: RestaurantMealAnalysis = {
      supportsYou: ['This item includes a protein source, which can help with satiety.'],
      mindfulOf: ['This is prepared fried — worth being mindful of.'],
      modifications: ['Ask if a grilled version is available.'],
      pairings: ['A side salad'],
      betterFitAlternatives: [],
      portionGuidance: 'Let your own hunger cues guide the portion.',
    };
    expect(containsForbiddenPhrase(fine)).toBe(false);
  });
});
