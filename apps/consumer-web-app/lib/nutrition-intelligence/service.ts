/**
 * Nutrition Intelligence Service. Reads the Primal Pattern Assessment
 * result (lib/primal-pattern/store.ts) and derives a small, stable,
 * versioned profile — never raw table rows — for other platform features
 * to consume. Food Lens will become the first consumer of this in a later
 * phase; it is written now against this service, not against
 * primal_pattern_assessments directly, so that a future change to how
 * assessments are stored never requires a change in Food Lens.
 *
 * Deliberately excludes health-safety information (lib/health-safety/) —
 * that's a structurally separate concern (migration 65) with its own
 * accessor, getMemberHealthSafetyOverrides below, so a consumer must
 * explicitly opt in to reading it rather than have it silently folded
 * into a general-purpose profile response.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PRIMAL_PATTERN_QUESTIONNAIRE,
  PRIMAL_PATTERN_QUESTIONNAIRE_ID,
} from '../primal-pattern/questionnaire';
import { getLatestCompletedPrimalPatternSummary } from '../primal-pattern/store';
import { getNutritionSafetyProfile } from '../health-safety/store';
import type { NutritionSafetyProfile } from '../health-safety/types';
import {
  NUTRITION_INTELLIGENCE_SERVICE_VERSION,
  type CompletionQualityStatus,
  type MealFrequencyGuidance,
  type NutritionIntelligenceProfile,
} from './types';

const PORTION_GUIDE_VERSION = 1;
const TOTAL_QUESTIONS = PRIMAL_PATTERN_QUESTIONNAIRE.questions.length;

/** skippedCount === 0 -> high_quality; up to ~30% skipped -> usable; beyond that the letter counts are thin enough to be a weak signal. */
function classifyCompletionQuality(skippedCount: number): CompletionQualityStatus {
  if (skippedCount === 0) return 'high_quality';
  if (skippedCount / TOTAL_QUESTIONS <= 0.3) return 'usable';
  return 'low_quality';
}

function mealFrequencyFor(
  result: NutritionIntelligenceProfile['currentResult']
): MealFrequencyGuidance {
  switch (result) {
    case 'polar':
      return '4_to_5_smaller_meals';
    case 'variable':
      return '3_to_4_balanced_meals';
    case 'equatorial':
      return '3_structured_meals';
    default:
      return 'not_available';
  }
}

/**
 * The member's current nutrition preference profile, derived from their
 * latest completed Primal Pattern Assessment. Returns a 'not_started'
 * profile (never null) when no completed assessment exists, so a
 * consumer can always render *something* without a special-case branch —
 * mirroring the "every displayed result must originate from an actual
 * query, never a hardcoded default" rule while still giving callers a
 * well-typed value instead of null.
 */
export async function getMemberNutritionProfile(
  supabase: SupabaseClient,
  memberId: string
): Promise<NutritionIntelligenceProfile> {
  const latest = await getLatestCompletedPrimalPatternSummary(
    supabase,
    memberId,
    PRIMAL_PATTERN_QUESTIONNAIRE_ID
  );

  if (!latest) {
    return {
      serviceVersion: NUTRITION_INTELLIGENCE_SERVICE_VERSION,
      memberId,
      questionnaireVersion: PRIMAL_PATTERN_QUESTIONNAIRE.version,
      currentResult: null,
      completionDate: null,
      aCount: 0,
      bCount: 0,
      skippedCount: 0,
      bothAnswerCount: 0,
      completionQualityStatus: 'not_started',
      mealFrequency: 'not_available',
      portionGuideVersion: PORTION_GUIDE_VERSION,
    };
  }

  return {
    serviceVersion: NUTRITION_INTELLIGENCE_SERVICE_VERSION,
    memberId,
    questionnaireVersion: PRIMAL_PATTERN_QUESTIONNAIRE.version,
    currentResult: latest.result,
    completionDate: latest.completedAt,
    aCount: latest.aCount,
    bCount: latest.bCount,
    skippedCount: latest.skippedCount,
    bothAnswerCount: latest.bothCount,
    completionQualityStatus: classifyCompletionQuality(latest.skippedCount),
    mealFrequency: mealFrequencyFor(latest.result),
    portionGuideVersion: PORTION_GUIDE_VERSION,
  };
}

/**
 * The member's current health-safety overrides (migration 65) — a
 * separate accessor by design; see this file's header comment. A
 * consumer generating unsupervised nutrition guidance should check
 * `hasActiveOverride` here before acting on `getMemberNutritionProfile`'s
 * result.
 */
export async function getMemberHealthSafetyOverrides(
  supabase: SupabaseClient,
  memberId: string
): Promise<NutritionSafetyProfile | null> {
  return getNutritionSafetyProfile(supabase, memberId);
}
