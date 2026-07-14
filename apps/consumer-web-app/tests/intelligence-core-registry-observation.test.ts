/**
 * Unit test for deriveMovementResponseFromRegistryObservation
 * (lib/intelligence-core/observations.ts) — same "re-wrap, never
 * re-detect" style as the existing deriveEngagementRhythmObservation /
 * deriveMotivationStyleObservation tests in
 * tests/intelligence-core-observations.test.ts, no Supabase client.
 */
import { describe, it, expect } from 'vitest';
import { deriveMovementResponseFromRegistryObservation } from '../lib/intelligence-core/observations';
import type { MemberIntelligenceReport } from '../lib/intelligence-engine/types';

const AS_OF = '2026-06-30';

function baseReport(overrides: Partial<MemberIntelligenceReport> = {}): MemberIntelligenceReport {
  return {
    memberId: 'u1',
    localDate: AS_OF,
    generatedAt: '2026-06-30T00:00:00.000Z',
    longitudinalTrends: [],
    patterns: [],
    hypotheses: [],
    priorities: {
      primaryPriority: null,
      secondaryPriority: null,
      areaToMaintain: null,
      emergingConcern: null,
      strongestCurrentArea: null,
      recommendedCoachAttentionLevel: 'none',
      coachAttentionReason: null,
    },
    recommendations: [],
    memberSummary: {
      currentFocus: null,
      biggestObstacle: null,
      recentWins: [],
      mostImprovedArea: null,
      greatestOpportunity: null,
      currentCoachingStyle: 'balanced',
      recommendedNextDiscussion: null,
      currentMotivation: 'steady',
      adherenceScore: null,
      wellnessTrajectory: 'insufficient_data',
    },
    alerts: [],
    ...overrides,
  };
}

describe('deriveMovementResponseFromRegistryObservation — re-wrap, never re-detect', () => {
  it('returns null when the Intelligence Engine found no body_assessment_finding pattern', () => {
    expect(deriveMovementResponseFromRegistryObservation(baseReport())).toBeNull();
  });

  it('wraps an existing body_assessment_finding pattern verbatim, never re-deriving it', () => {
    const report = baseReport({
      patterns: [
        {
          key: 'registry_posture_forward_head',
          kind: 'body_assessment_finding',
          label: 'forward head',
          description: 'Forward head posture noted on both sides.',
          confidence: 0.75,
          evidenceRefs: [{ type: 'registry_entry', id: 'entry-1' }],
          sourceInsightId: null,
        },
      ],
    });

    const draft = deriveMovementResponseFromRegistryObservation(report);
    expect(draft).not.toBeNull();
    expect(draft!.domain).toBe('movement_response');
    expect(draft!.observationKey).toBe('movement_response_body_assessment_finding');
    expect(draft!.statement).toBe('Forward head posture noted on both sides.');
    expect(draft!.confidence).toBe(0.75);
    expect(draft!.evidenceRefs).toEqual([{ type: 'registry_entry', id: 'entry-1' }]);
  });
});
