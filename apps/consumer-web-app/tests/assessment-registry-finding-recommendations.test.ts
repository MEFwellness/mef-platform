import { describe, it, expect } from 'vitest';
import type { RegistryEntry } from '@mef/shared-types-contracts';
import { suggestAssessmentsFromFindings } from '../lib/assessment-registry/findingRecommendations';

function finding(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'e1',
    member_id: 'u1',
    entry_kind: 'finding',
    domain: 'nutrition',
    code: 'digestive_complaints',
    label: 'Digestive Complaints',
    severity: 'moderate',
    numeric_value: null,
    unit: null,
    confidence: 0.6,
    narrative: null,
    evidence_refs: [],
    source_feature: 'onboarding_baseline_finding',
    source_record_id: 'r1',
    status: 'active',
    trend_status: 'new',
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

describe('suggestAssessmentsFromFindings', () => {
  it('suggests the nutrition questionnaire for a qualifying nutrition-domain finding', () => {
    const result = suggestAssessmentsFromFindings([finding()]);
    expect(result).toHaveLength(1);
    expect(result[0]!.assessmentKey).toBe('chek-hlc1-nutrition-lifestyle');
    expect(result[0]!.supportingFindingCodes).toEqual(['digestive_complaints']);
  });

  it('ignores mild findings — not strong enough evidence to suggest another assessment', () => {
    expect(suggestAssessmentsFromFindings([finding({ severity: 'mild' })])).toHaveLength(0);
  });

  it('ignores member_visible=false findings (coach-only)', () => {
    expect(suggestAssessmentsFromFindings([finding({ member_visible: false })])).toHaveLength(0);
  });

  it('ignores inactive/superseded findings', () => {
    expect(suggestAssessmentsFromFindings([finding({ status: 'superseded' })])).toHaveLength(0);
  });

  it('ranks assessments with more supporting findings first', () => {
    const result = suggestAssessmentsFromFindings([
      finding({ id: 'a', domain: 'stress', code: 'elevated_stress' }),
      finding({ id: 'b', domain: 'sleep', code: 'poor_sleep_quality' }),
      finding({ id: 'c', domain: 'nutrition', code: 'digestive_complaints' }),
    ]);
    // stress + sleep both route to four-doctors (2 findings); nutrition routes to chek-hlc1 (1 finding).
    expect(result[0]!.assessmentKey).toBe('four-doctors');
    expect(result[0]!.supportingFindingCodes).toHaveLength(2);
  });

  it('respects excludeAssessmentKeys', () => {
    const result = suggestAssessmentsFromFindings([finding()], {
      excludeAssessmentKeys: ['chek-hlc1-nutrition-lifestyle'],
    });
    expect(result).toHaveLength(0);
  });
});
