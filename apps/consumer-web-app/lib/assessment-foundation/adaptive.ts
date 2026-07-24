import type { UnifiedAssessmentQuestion } from '@mef/shared-types-contracts';
import type { AdaptiveQuestion, Boost, CompletionRule, FollowUpRule, Rule } from '../adaptive-assessment-engine';

/**
 * unified_assessment_questions' requires/excludes/boosts/follow_up_rules/
 * skip_rules/completion_rules columns are typed `unknown | null` (raw
 * jsonb) — this is the one place that trusts stored content to match the
 * engine's Rule/Boost/FollowUpRule/CompletionRule shape, so selectNext/
 * selectBatch can operate on real fetched rows. Mirrors
 * lib/onboarding/adaptivePlan.ts's toAdaptive(), the only other place this
 * trust boundary exists today.
 */
export function toAdaptiveUnifiedQuestion(
  question: UnifiedAssessmentQuestion
): UnifiedAssessmentQuestion & AdaptiveQuestion {
  return {
    ...question,
    requires: (question.requires ?? null) as Rule[] | null,
    excludes: (question.excludes ?? null) as Rule[] | null,
    boosts: (question.boosts ?? null) as Boost[] | null,
    follow_up_rules: (question.follow_up_rules ?? null) as FollowUpRule[] | null,
    skip_rules: (question.skip_rules ?? null) as Rule[] | null,
    completion_rules: (question.completion_rules ?? null) as CompletionRule[] | null,
  };
}
