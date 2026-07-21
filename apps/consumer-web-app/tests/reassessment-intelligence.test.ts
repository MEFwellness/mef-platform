import { describe, it, expect } from 'vitest';
import type { RegistryEntry } from '@mef/shared-types-contracts';
import { evaluateReassessmentTriggers } from '../lib/reassessment-intelligence/service';

function finding(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'e1',
    member_id: 'u1',
    entry_kind: 'finding',
    domain: 'movement',
    code: 'hip_asymmetry',
    label: 'Hip Instability',
    severity: 'moderate',
    numeric_value: null,
    unit: null,
    confidence: 0.7,
    narrative: null,
    evidence_refs: [],
    source_feature: 'body_assessment_finding',
    source_record_id: 'r1',
    status: 'active',
    trend_status: 'worsening',
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    supersedes_id: null,
    superseded_by_id: null,
    recorded_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('evaluateReassessmentTriggers', () => {
  it('suggests a reassessment for a worsening, high-confidence finding', () => {
    const result = evaluateReassessmentTriggers([finding()], new Set());
    expect(result).toHaveLength(1);
    expect(result[0]!.assessmentKey).toBe('body-assessment');
    expect(result[0]!.triggerSource).toBe('finding_change');
    expect(result[0]!.triggerContext.findingCodes).toEqual(['hip_asymmetry']);
  });

  it('ignores a worsening finding below the confidence threshold', () => {
    expect(evaluateReassessmentTriggers([finding({ confidence: 0.4 })], new Set())).toHaveLength(0);
  });

  it('ignores a finding that is not worsening', () => {
    expect(
      evaluateReassessmentTriggers([finding({ trend_status: 'stable' })], new Set())
    ).toHaveLength(0);
  });

  it('does not duplicate a suggestion for an assessment with an already-pending schedule', () => {
    const result = evaluateReassessmentTriggers([finding()], new Set(['body-assessment']));
    expect(result).toHaveLength(0);
  });

  it('ignores a domain with no established assessment relationship', () => {
    expect(evaluateReassessmentTriggers([finding({ domain: 'lab' })], new Set())).toHaveLength(0);
  });
});
