/**
 * Integration coverage for the Food Lens <-> Nutrition Intelligence Service
 * connection (lib/nutrition-intelligence/coachingGuardrails.ts,
 * getMemberNutritionCoachingContext in lib/nutrition-intelligence/
 * service.ts, and both coaching narrative modules it now feeds:
 * lib/food-lens/coachingNarrative.ts for meal-photo scans and
 * lib/food-products/coachingNarrative.ts for barcode/product scans).
 *
 * ANTHROPIC_API_KEY/ANTHROPIC_MODEL are deliberately cleared before every
 * test in this file — same discipline as
 * tests/conversation-coach-integration.test.ts — so these tests verify the
 * deterministic scaffolding (safety-override short-circuit, graceful
 * fallback, correct data assembly) independent of whatever real
 * credentials happen to be present in a given environment. Asserting on
 * literal LLM-generated prose would be neither reliable nor free; the
 * hard-rule guardrails themselves (lib/nutrition-intelligence/
 * coachingGuardrails.ts) are pure functions and are unit-tested directly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { resetConversationCoachProviderForTests } from '../lib/conversation-coach/provider';
import { PRIMAL_PATTERN_QUESTIONNAIRE } from '../lib/primal-pattern/questionnaire';
import {
  completePrimalPatternAssessment,
  getOrCreateInProgressPrimalPatternAssessment,
  savePrimalPatternAnswer,
} from '../lib/primal-pattern/store';
import { upsertNutritionSafetyFlags } from '../lib/health-safety/store';
import { EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS } from '../lib/health-safety/types';
import {
  getMemberNutritionCoachingContext,
  getMemberNutritionProfile,
} from '../lib/nutrition-intelligence/service';
import {
  buildHealthSafetyPriorityMessage,
  containsNutritionCoachingForbiddenPhrase,
  NUTRITION_COACHING_FORBIDDEN_PHRASES,
} from '../lib/nutrition-intelligence/coachingGuardrails';
import {
  buildDeterministicFallbackNarrative,
  generateFoodLensCoachingNarrative,
} from '../lib/food-lens/coachingNarrative';
import { generateFoodCoachingNarrative } from '../lib/food-products/coachingNarrative';
import { runFoodRulesEngine } from '../lib/food-products/rulesEngine';
import type {
  FoodLensComparisonSignal,
  FoodLensDetectedItem,
  PrimalPatternProfile,
} from '@mef/shared-types-contracts';

const memberOne = TEST_USERS.memberOne;
const memberTwo = TEST_USERS.memberTwo;
const memberIds = [memberOne.id, memberTwo.id];

beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
  resetConversationCoachProviderForTests();
});

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('primal_pattern_assessments').delete().in('member_id', memberIds);
  await service.from('member_nutrition_safety_flags').delete().in('member_id', memberIds);
});

function target(overrides: Partial<PrimalPatternProfile> = {}): PrimalPatternProfile {
  return {
    id: 'test-profile-id',
    member_id: memberOne.id,
    pattern_label: 'Protein-Forward',
    protein_emphasis: 'high',
    carb_emphasis: 'low',
    fat_emphasis: 'moderate',
    source: 'manual',
    is_active: true,
    supersedes_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function detectedItem(
  overrides: Partial<FoodLensDetectedItem> = {}
): Pick<FoodLensDetectedItem, 'label' | 'category' | 'confidence'> {
  return { label: 'Grilled chicken breast', category: 'protein', confidence: 0.8, ...overrides };
}

const matchingSignals: FoodLensComparisonSignal[] = [
  { dimension: 'protein', mealLevel: 'high', targetLevel: 'high', direction: 'match' },
  { dimension: 'carb', mealLevel: 'low', targetLevel: 'low', direction: 'match' },
  { dimension: 'fat', mealLevel: 'moderate', targetLevel: 'moderate', direction: 'match' },
];

function highConfidenceMacroEstimate() {
  return {
    protein: { level: 'high' as const, confidence: 0.85 },
    carb: { level: 'low' as const, confidence: 0.8 },
    fat: { level: 'moderate' as const, confidence: 0.75 },
  };
}

function lowConfidenceMacroEstimate() {
  return {
    protein: { level: 'moderate' as const, confidence: 0.3 },
    carb: { level: 'moderate' as const, confidence: 0.25 },
    fat: { level: 'low' as const, confidence: 0.2 },
  };
}

async function answerAllAndComplete(
  client: Awaited<ReturnType<typeof signInAs>>,
  memberId: string,
  letters: ('A' | 'B')[]
) {
  const started = await getOrCreateInProgressPrimalPatternAssessment(
    client,
    memberId,
    PRIMAL_PATTERN_QUESTIONNAIRE
  );
  for (const q of PRIMAL_PATTERN_QUESTIONNAIRE.questions) {
    await savePrimalPatternAnswer(
      client,
      PRIMAL_PATTERN_QUESTIONNAIRE,
      started.record.id,
      q.number,
      letters
    );
  }
  return completePrimalPatternAssessment(client, PRIMAL_PATTERN_QUESTIONNAIRE, started.record.id);
}

describe('nutrition coaching guardrails (pure functions)', () => {
  it('flags every banned phrase from the product brief', () => {
    for (const phrase of NUTRITION_COACHING_FORBIDDEN_PHRASES) {
      expect(containsNutritionCoachingForbiddenPhrase(`This is a ${phrase} example.`)).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(containsNutritionCoachingForbiddenPhrase('This is a CHEAT MEAL, apparently.')).toBe(
      true
    );
  });

  it('does not flag genuinely supportive, non-judgmental language', () => {
    const supportive =
      'This meal contains a strong protein foundation and appears to align with the eating pattern you reported.';
    expect(containsNutritionCoachingForbiddenPhrase(supportive)).toBe(false);
  });

  it('the health-safety priority message never issues a carb/protein/fat directive and names the health profile', () => {
    const message = buildHealthSafetyPriorityMessage();
    expect(message.toLowerCase()).toContain('health profile');
    expect(containsNutritionCoachingForbiddenPhrase(message)).toBe(false);
    expect(message.toLowerCase()).not.toMatch(/eat (more|fewer|less) carb/);
  });
});

describe('getMemberNutritionCoachingContext', () => {
  it('a member with no assessment and no safety flags gets a well-typed, non-null empty context', async () => {
    const client = await signInAs(memberTwo);
    await serviceRoleClient()
      .from('primal_pattern_assessments')
      .delete()
      .eq('member_id', memberTwo.id);
    await serviceRoleClient()
      .from('member_nutrition_safety_flags')
      .delete()
      .eq('member_id', memberTwo.id);

    const context = await getMemberNutritionCoachingContext(client, memberTwo.id);
    expect(context.profile.currentResult).toBeNull();
    expect(context.profile.completionQualityStatus).toBe('not_started');
    expect(context.safetyOverrides).toBeNull();
  });

  it('combines a completed assessment result with an active safety override for the same member', async () => {
    const client = await signInAs(memberOne);
    await serviceRoleClient()
      .from('primal_pattern_assessments')
      .delete()
      .eq('member_id', memberOne.id);

    await answerAllAndComplete(client, memberOne.id, ['B']); // equatorial
    await upsertNutritionSafetyFlags(
      client,
      memberOne.id,
      { ...EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS, hasDiabetes: true },
      memberOne.id,
      'member'
    );

    const context = await getMemberNutritionCoachingContext(client, memberOne.id);
    expect(context.profile.currentResult).toBe('equatorial');
    expect(context.profile.mealFrequency).toBe('3_structured_meals');
    expect(context.safetyOverrides?.hasActiveOverride).toBe(true);
    expect(context.safetyOverrides?.flags.hasDiabetes).toBe(true);
  });
});

describe('generateFoodLensCoachingNarrative (meal-photo scans)', () => {
  it('a member with an active health-safety override gets the priority message, never LLM-generated macro coaching', async () => {
    const client = await signInAs(memberOne);
    await upsertNutritionSafetyFlags(
      client,
      memberOne.id,
      { ...EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS, usesInsulin: true },
      memberOne.id,
      'member'
    );

    const result = await generateFoodLensCoachingNarrative({
      supabase: client,
      memberId: memberOne.id,
      localDate: '2031-02-01',
      detectedItems: [detectedItem()],
      macroEstimate: highConfidenceMacroEstimate(),
      target: target(),
      signals: matchingSignals,
    });

    expect(result.narrative).toBe(buildHealthSafetyPriorityMessage());
    expect(result.promptVersion).toBeNull();
    expect(containsNutritionCoachingForbiddenPhrase(result.narrative)).toBe(false);

    // Clean up so later tests in this file see a clean safety-flag slate.
    await upsertNutritionSafetyFlags(
      client,
      memberOne.id,
      EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS,
      memberOne.id,
      'member'
    );
  });

  it('a member without an active override and without a configured LLM provider still gets a coherent, signal-derived narrative (never blank, never throws)', async () => {
    const client = await signInAs(memberTwo);
    await serviceRoleClient()
      .from('member_nutrition_safety_flags')
      .delete()
      .eq('member_id', memberTwo.id);

    const result = await generateFoodLensCoachingNarrative({
      supabase: client,
      memberId: memberTwo.id,
      localDate: '2031-02-01',
      detectedItems: [detectedItem()],
      macroEstimate: highConfidenceMacroEstimate(),
      target: target({ member_id: memberTwo.id }),
      signals: matchingSignals,
    });

    expect(result.promptVersion).toBeNull();
    expect(result.narrative).toBe(
      buildDeterministicFallbackNarrative(matchingSignals, 'Protein-Forward')
    );
    expect(result.narrative.length).toBeGreaterThan(0);
  });

  it('never fails when the macro-estimate confidence is low (member sees an honest, still-generated result)', async () => {
    const client = await signInAs(memberTwo);
    const lightSignals: FoodLensComparisonSignal[] = [
      { dimension: 'protein', mealLevel: 'moderate', targetLevel: 'high', direction: 'light' },
      { dimension: 'carb', mealLevel: 'moderate', targetLevel: 'low', direction: 'heavy' },
      { dimension: 'fat', mealLevel: 'low', targetLevel: 'moderate', direction: 'light' },
    ];

    const result = await generateFoodLensCoachingNarrative({
      supabase: client,
      memberId: memberTwo.id,
      localDate: '2031-02-01',
      detectedItems: [detectedItem({ confidence: 0.3 })],
      macroEstimate: lowConfidenceMacroEstimate(),
      target: target({ member_id: memberTwo.id }),
      signals: lightSignals,
    });

    expect(result.narrative.length).toBeGreaterThan(0);
    expect(containsNutritionCoachingForbiddenPhrase(result.narrative)).toBe(false);
  });

  it('references the real completed-assessment data flow without inventing history: a member with a completed assessment still gets a valid narrative', async () => {
    const client = await signInAs(memberOne);
    await serviceRoleClient()
      .from('primal_pattern_assessments')
      .delete()
      .eq('member_id', memberOne.id);
    await answerAllAndComplete(client, memberOne.id, ['A']); // polar

    const profile = await getMemberNutritionProfile(client, memberOne.id);
    expect(profile.currentResult).toBe('polar');

    const result = await generateFoodLensCoachingNarrative({
      supabase: client,
      memberId: memberOne.id,
      localDate: '2031-02-01',
      detectedItems: [detectedItem()],
      macroEstimate: highConfidenceMacroEstimate(),
      target: target(),
      signals: matchingSignals,
    });

    expect(result.narrative.length).toBeGreaterThan(0);
    expect(result.narrative).not.toMatch(/you always|you usually/i);
  });
});

describe('generateFoodCoachingNarrative (barcode/product scans)', () => {
  function rulesResult() {
    return runFoodRulesEngine({
      productName: 'Test Granola Bar',
      dataCompleteness: 'complete',
      nutrients: {
        calories: 150,
        proteinG: 8,
        totalCarbohydrateG: 20,
        fiberG: 4,
        totalSugarG: 6,
        addedSugarG: 4,
        totalFatG: 6,
        saturatedFatG: 1,
        monounsaturatedFatG: 3,
        polyunsaturatedFatG: 2,
        transFatG: 0,
        sodiumMg: 120,
        potassiumMg: 90,
      },
      ingredientsText: 'oats, honey, almonds, sea salt',
      ingredientsList: ['oats', 'honey', 'almonds', 'sea salt'],
      additives: [],
    });
  }

  it('a member with an active health-safety override gets the priority message for a barcode scan too', async () => {
    const client = await signInAs(memberOne);
    await upsertNutritionSafetyFlags(
      client,
      memberOne.id,
      { ...EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS, isPregnant: true },
      memberOne.id,
      'member'
    );

    const { result, promptVersion } = await generateFoodCoachingNarrative({
      supabase: client,
      memberId: memberOne.id,
      localDate: '2031-02-01',
      productName: 'Test Granola Bar',
      brand: 'MEF Test Brand',
      servingSizeText: '35 g',
      rulesResult: rulesResult(),
      allergenMatches: [],
      dietaryPattern: null,
    });

    expect(promptVersion).toBeNull();
    expect(result.mindfulOf).toBe(buildHealthSafetyPriorityMessage());
    expect(result.supportsYou).toBeNull();

    await upsertNutritionSafetyFlags(
      client,
      memberOne.id,
      EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS,
      memberOne.id,
      'member'
    );
  });

  it('a member without an override and without a configured LLM provider still gets a coherent deterministic result', async () => {
    const client = await signInAs(memberTwo);
    await serviceRoleClient()
      .from('member_nutrition_safety_flags')
      .delete()
      .eq('member_id', memberTwo.id);

    const { result, promptVersion } = await generateFoodCoachingNarrative({
      supabase: client,
      memberId: memberTwo.id,
      localDate: '2031-02-01',
      productName: 'Test Granola Bar',
      brand: 'MEF Test Brand',
      servingSizeText: '35 g',
      rulesResult: rulesResult(),
      allergenMatches: [],
      dietaryPattern: null,
    });

    expect(promptVersion).toBeNull();
    expect(result.supportsYou).not.toBeNull();
    const combined = [result.supportsYou, result.mindfulOf, result.bestFit, result.recommendation]
      .filter(Boolean)
      .join(' ');
    expect(containsNutritionCoachingForbiddenPhrase(combined)).toBe(false);
  });
});
