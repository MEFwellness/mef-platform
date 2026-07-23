/**
 * Unit tests for the Recommendation Engine's builder (Prompt 11) — pure
 * functions only. Confirms safety suppression mirrors the Root Router's
 * existing posture exactly, the medical referral flag is only ever
 * reachable via the explicit open-alert signal (never invented from
 * domain/priority alone), and every output traces to a real input field.
 */
import { describe, it, expect } from 'vitest';
import { buildMemberRecommendations } from '../lib/recommendation-engine/builder';
import type { Recommendation } from '../lib/intelligence-engine/types';
import type { RootRouterOutcomeView } from '../lib/investigation-engine/routerOutcome';

function rec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    domain: 'sleep',
    title: 'Improve your wind-down routine',
    detail: 'A consistent bedtime routine can help sleep quality.',
    priority: 'high',
    confidence: 0.8,
    evidence: ['Sleep trend: declining (80% confidence).'],
    ...overrides,
  };
}

const NO_ACTION_OUTCOME: RootRouterOutcomeView = {
  outcome: 'no_action_needed',
  memberMessage: 'Nothing urgent right now — things look steady.',
  investigation: null,
};

describe('buildMemberRecommendations', () => {
  it('suppresses every recommendation except one coach_review item when a safety topic is restricted', () => {
    const result = buildMemberRecommendations({
      recommendations: [rec(), rec({ domain: 'movement', title: 'Move more' })],
      routerOutcome: NO_ACTION_OUTCOME,
      isCoachAttentionPriority: false,
      restrictedTopics: ['stress'],
      hasOpenMedicalEvaluationAlert: false,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('coach_review');
    expect(result[0]!.completionTracking).toBe(false);
  });

  it('never surfaces medical_referral_flag when no open medical evaluation alert exists', () => {
    const result = buildMemberRecommendations({
      recommendations: [rec({ domain: 'coach_follow_up', priority: 'high' })],
      routerOutcome: NO_ACTION_OUTCOME,
      isCoachAttentionPriority: true,
      restrictedTopics: [],
      hasOpenMedicalEvaluationAlert: false,
    });
    expect(result.some((r) => r.category === 'medical_referral_flag')).toBe(false);
  });

  it('adds exactly one medical_referral_flag entry, on top of the real recommendations, when an open medical evaluation alert exists', () => {
    const result = buildMemberRecommendations({
      recommendations: [rec()],
      routerOutcome: NO_ACTION_OUTCOME,
      isCoachAttentionPriority: false,
      restrictedTopics: [],
      hasOpenMedicalEvaluationAlert: true,
    });

    const flagged = result.filter((r) => r.category === 'medical_referral_flag');
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.completionTracking).toBe(false);
    // the real recommendation is still present, not replaced
    expect(result.some((r) => r.title === 'Improve your wind-down routine')).toBe(true);
  });

  it('every mapped recommendation carries its source title/detail/evidence verbatim — never invented', () => {
    const source = rec({ evidence: ['fact A', 'fact B'] });
    const result = buildMemberRecommendations({
      recommendations: [source],
      routerOutcome: NO_ACTION_OUTCOME,
      isCoachAttentionPriority: false,
      restrictedTopics: [],
      hasOpenMedicalEvaluationAlert: false,
    });

    const mapped = result.find((r) => r.title === source.title)!;
    expect(mapped.explanation).toBe(source.detail);
    expect(mapped.supportingFindings).toEqual(source.evidence);
    expect(mapped.confidence).toBe(source.confidence);
  });

  it('returns an empty list when there are no recommendations and no medical flag', () => {
    const result = buildMemberRecommendations({
      recommendations: [],
      routerOutcome: NO_ACTION_OUTCOME,
      isCoachAttentionPriority: false,
      restrictedTopics: [],
      hasOpenMedicalEvaluationAlert: false,
    });
    expect(result).toEqual([]);
  });
});
