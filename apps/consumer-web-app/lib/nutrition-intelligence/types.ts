/**
 * Nutrition Intelligence Service — public contract. This is the stable
 * shape every consumer (Food Lens later; the versioned HTTP endpoint at
 * app/api/v1/nutrition-intelligence/route.ts now) reads. Consumers should
 * depend on this type and getMemberNutritionProfile() rather than
 * querying primal_pattern_assessments directly, so the underlying storage
 * can evolve without every consumer needing to change.
 */

import type { PrimalPatternResult } from '../primal-pattern/types';

export const NUTRITION_INTELLIGENCE_SERVICE_VERSION = 1;

export type CompletionQualityStatus = 'not_started' | 'high_quality' | 'usable' | 'low_quality';

export type MealFrequencyGuidance =
  'not_available' | '4_to_5_smaller_meals' | '3_to_4_balanced_meals' | '3_structured_meals';

export type NutritionIntelligenceProfile = {
  serviceVersion: number;
  memberId: string;
  questionnaireVersion: number;
  currentResult: PrimalPatternResult | null;
  completionDate: string | null;
  aCount: number;
  bCount: number;
  skippedCount: number;
  bothAnswerCount: number;
  completionQualityStatus: CompletionQualityStatus;
  mealFrequency: MealFrequencyGuidance;
  portionGuideVersion: number;
};
