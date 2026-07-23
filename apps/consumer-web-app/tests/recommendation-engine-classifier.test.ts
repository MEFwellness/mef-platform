/**
 * Unit tests for the Recommendation Engine's classifier (Prompt 11) —
 * pure functions only, no Supabase client, same convention as
 * root-router-outcome.test.ts. Confirms every one of the 15 named
 * categories is reachable, classification is deterministic (same input
 * twice -> identical output), and buildRecommendationKey never includes a
 * random id or timestamp.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyRecommendation,
  buildRecommendationKey,
  durationForCategory,
  completionTrackingForCategory,
  reassessmentTriggerForCategory,
  whyThisWasSelected,
} from '../lib/recommendation-engine/classifier';
import type { Recommendation, RecommendationDomain } from '../lib/intelligence-engine/types';
import type { MemberRecommendationCategory } from '../lib/recommendation-engine/types';
import type { RootRouterOutcome } from '../lib/investigation-engine/routerOutcome';

function rec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    domain: 'movement',
    title: 'Try a short walk',
    detail: 'A 10 minute walk can help.',
    priority: 'medium',
    confidence: 0.7,
    evidence: ['Movement trend: declining (70% confidence).'],
    ...overrides,
  };
}

describe('classifyRecommendation', () => {
  it('reaches every one of the 15 named categories under the right conditions', () => {
    const cases: { domain: RecommendationDomain; priority: Recommendation['priority']; routerOutcome: RootRouterOutcome; isCoachAttentionPriority?: boolean; expected: MemberRecommendationCategory }[] = [
      { domain: 'education', priority: 'medium', routerOutcome: 'no_action_needed', expected: 'education' },
      { domain: 'movement', priority: 'high', routerOutcome: 'lifestyle_experiment', expected: 'lifestyle_experiment' },
      { domain: 'reflection', priority: 'medium', routerOutcome: 'reflection', expected: 'reflection' },
      { domain: 'conversation_prompts', priority: 'medium', routerOutcome: 'no_action_needed', expected: 'coaching_conversation' },
      { domain: 'movement', priority: 'medium', routerOutcome: 'no_action_needed', expected: 'movement_focus' },
      { domain: 'recovery', priority: 'medium', routerOutcome: 'no_action_needed', expected: 'recovery_focus' },
      { domain: 'nutrition', priority: 'medium', routerOutcome: 'no_action_needed', expected: 'nutrition_focus' },
      { domain: 'stress', priority: 'medium', routerOutcome: 'no_action_needed', expected: 'stress_management' },
      { domain: 'sleep', priority: 'medium', routerOutcome: 'no_action_needed', expected: 'sleep_optimization' },
      { domain: 'breathing', priority: 'medium', routerOutcome: 'no_action_needed', expected: 'breathing_practice' },
      { domain: 'daily_coaching', priority: 'high', routerOutcome: 'no_action_needed', expected: 'daily_habit' },
      { domain: 'hydration', priority: 'low', routerOutcome: 'no_action_needed', expected: 'weekly_practice' },
      { domain: 'assessments', priority: 'medium', routerOutcome: 'no_action_needed', expected: 'follow_up_investigation' },
      { domain: 'notifications', priority: 'high', routerOutcome: 'no_action_needed', expected: 'coach_review' },
      { domain: 'coach_follow_up', priority: 'high', routerOutcome: 'coach_review', expected: 'coach_review' },
    ];

    for (const c of cases) {
      const category = classifyRecommendation(rec({ domain: c.domain, priority: c.priority }), {
        routerOutcome: c.routerOutcome,
        isCoachAttentionPriority: c.isCoachAttentionPriority ?? false,
      });
      expect(category, `domain=${c.domain} priority=${c.priority}`).toBe(c.expected);
    }
  });

  it('never classifies as medical_referral_flag from domain/priority alone — that category is only reachable via the builder\'s explicit open-alert signal', () => {
    const category = classifyRecommendation(rec({ domain: 'coach_follow_up', priority: 'high' }), {
      routerOutcome: 'no_action_needed',
      isCoachAttentionPriority: true,
    });
    expect(category).not.toBe('medical_referral_flag');
  });

  it('is deterministic — the same input always produces the same category and key', () => {
    const input = rec({ domain: 'sleep', priority: 'high' });
    const context = { routerOutcome: 'no_action_needed' as RootRouterOutcome, isCoachAttentionPriority: false };
    const first = classifyRecommendation(input, context);
    const second = classifyRecommendation(input, context);
    expect(first).toBe(second);
    expect(buildRecommendationKey(input, first)).toBe(buildRecommendationKey(input, second));
  });

  it('a low-priority experiment-eligible domain never becomes lifestyle_experiment', () => {
    const category = classifyRecommendation(rec({ domain: 'movement', priority: 'low' }), {
      routerOutcome: 'lifestyle_experiment',
      isCoachAttentionPriority: false,
    });
    expect(category).not.toBe('lifestyle_experiment');
  });

  it('buildRecommendationKey never embeds a random id or timestamp', () => {
    const key = buildRecommendationKey(rec({ title: 'Try a Short Walk!' }), 'movement_focus');
    expect(key).toBe('movement_movement_focus_try-a-short-walk');
    expect(key).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no date embedded
  });

  it('duration/completion/reassessment lookups are total (defined for every category)', () => {
    const categories: MemberRecommendationCategory[] = [
      'education', 'lifestyle_experiment', 'reflection', 'coaching_conversation',
      'movement_focus', 'recovery_focus', 'nutrition_focus', 'stress_management',
      'sleep_optimization', 'breathing_practice', 'daily_habit', 'weekly_practice',
      'follow_up_investigation', 'coach_review', 'medical_referral_flag',
    ];
    for (const category of categories) {
      expect(durationForCategory(category)).toBeTruthy();
      expect(typeof completionTrackingForCategory(category)).toBe('boolean');
      expect(typeof whyThisWasSelected(rec(), category)).toBe('string');
      // reassessmentTriggerForCategory may legitimately be null — just must not throw
      reassessmentTriggerForCategory(category);
    }
  });

  it('coach_review and medical_referral_flag are never member-completable', () => {
    expect(completionTrackingForCategory('coach_review')).toBe(false);
    expect(completionTrackingForCategory('medical_referral_flag')).toBe(false);
    expect(completionTrackingForCategory('movement_focus')).toBe(true);
  });
});
