import { describe, it, expect } from 'vitest';
import { bodyAssessmentAgent } from '../lib/ai/agents/body-assessment';
import { agentsRespondingTo, getAgentDefinition } from '../lib/ai/agents/registry';
import type { AgentContext } from '../lib/ai/agents/types';
import type { AiEvent } from '@mef/shared-types-contracts';

function fakeEvent(payload: Record<string, unknown>): AiEvent {
  return {
    id: 'evt-1',
    event_type: 'body_assessment_completed',
    member_id: 'member-1',
    source: 'member',
    payload,
    occurred_at: '2026-01-01T00:00:00.000Z',
    processed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function fakeContext(payload: Record<string, unknown>): AgentContext {
  return {
    supabase: {} as AgentContext['supabase'],
    memberId: 'member-1',
    event: fakeEvent(payload),
    facts: {
      daysSinceLastCheckin: null,
      stressConsecutiveIncreaseDays: 0,
      sleepConsecutiveDecreaseDays: 0,
      stressTrend: null,
      sleepTrend: null,
      energyTrend: null,
      moodTrend: null,
      hydrationTrend: null,
      digestionTrend: null,
      movementTrend: null,
      painTrend: null,
      wellnessIndexScore: null,
      wellnessIndexDelta: null,
    },
    ruleMatches: [],
  };
}

describe('bodyAssessmentAgent registration', () => {
  it('is registered under the body_assessment key and responds to body_assessment_completed', () => {
    expect(getAgentDefinition('body_assessment')).toBe(bodyAssessmentAgent);
    expect(agentsRespondingTo('body_assessment_completed')).toContain(bodyAssessmentAgent);
  });

  it('does not respond to unrelated event types', () => {
    expect(agentsRespondingTo('member_completed_checkin')).not.toContain(bodyAssessmentAgent);
  });
});

describe('bodyAssessmentAgent.handle — deterministic bookkeeping only', () => {
  it('produces nothing when findingsCount is zero — the expected state with no provider configured', async () => {
    const output = await bodyAssessmentAgent.handle(fakeContext({ findingsCount: 0 }));
    expect(output).toEqual([]);
  });

  it('produces nothing when findingsCount is absent from the payload', async () => {
    const output = await bodyAssessmentAgent.handle(fakeContext({}));
    expect(output).toEqual([]);
  });

  it('produces a linked insight -> recommendation -> action item when findings exist, at medium priority', async () => {
    const output = await bodyAssessmentAgent.handle(
      fakeContext({
        assessmentId: 'assessment-1',
        assessmentTypeLabel: 'Static Posture',
        findingsCount: 3,
        significantFindingsCount: 0,
      })
    );

    expect(output).toHaveLength(1);
    const item = output[0]!;
    expect(item.insight?.insightType).toBe('body_assessment_findings_ready');
    expect(item.insight?.description).toContain('3 findings');
    expect(item.recommendation?.priority).toBe('medium');
    expect(item.action?.actionType).toBe('coach_notification');
    expect(item.action?.requiresCoachApproval).toBe(false);
  });

  it('raises priority to high when at least one finding is significant', async () => {
    const output = await bodyAssessmentAgent.handle(
      fakeContext({
        assessmentId: 'assessment-1',
        assessmentTypeLabel: 'Static Posture',
        findingsCount: 1,
        significantFindingsCount: 1,
      })
    );
    expect(output[0]!.recommendation?.priority).toBe('high');
  });

  it('never interprets or diagnoses — description only ever references a count, never a specific finding type', async () => {
    const output = await bodyAssessmentAgent.handle(
      fakeContext({ assessmentTypeLabel: 'Squat', findingsCount: 1 })
    );
    expect(output[0]!.insight?.description).not.toMatch(
      /forward head|rounded shoulders|pelvic tilt|kyphosis/i
    );
  });
});
