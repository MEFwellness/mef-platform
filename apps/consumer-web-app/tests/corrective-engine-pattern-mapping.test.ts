/**
 * Guard tests for detectCorrectivePatterns (lib/corrective-engine/
 * patternMapping.ts) — pure function, constructed BodyAssessmentFinding
 * fixtures, no Supabase. See that file's header for why Upper Cross/Flat
 * Back are inferred rather than a 1:1 finding_type match, and why Lower
 * Cross and Flat Back are treated as mutually exclusive.
 */
import { describe, it, expect } from 'vitest';
import type { BodyAssessmentFinding } from '@mef/shared-types-contracts';
import { detectCorrectivePatterns, overallSeverity } from '../lib/corrective-engine/patternMapping';

let counter = 0;
function finding(overrides: Partial<BodyAssessmentFinding>): BodyAssessmentFinding {
  counter += 1;
  return {
    id: `finding-${counter}`,
    assessment_id: 'assessment-1',
    member_id: 'member-1',
    finding_type: 'forward_head',
    side: 'not_applicable',
    severity: 'moderate',
    confidence: 0.8,
    narrative: null,
    evidence: [],
    provider_name: 'mediapipe',
    status: 'pending_review',
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    coach_override_notes: null,
    supersedes_id: null,
    superseded_by_id: null,
    threshold_config_version: null,
    raw_value: null,
    unit: null,
    side_diff: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('detectCorrectivePatterns', () => {
  it('maps forward_head directly to the forward_head blueprint', () => {
    const patterns = detectCorrectivePatterns([finding({ finding_type: 'forward_head', severity: 'moderate' })]);
    expect(patterns).toEqual([
      { blueprint: 'forward_head', severity: 'moderate', supportingFindingIds: [expect.any(String)] },
    ]);
  });

  it('maps lower_crossed_pattern directly to the lower_cross blueprint', () => {
    const patterns = detectCorrectivePatterns([
      finding({ finding_type: 'lower_crossed_pattern', severity: 'significant' }),
    ]);
    expect(patterns).toEqual([{ blueprint: 'lower_cross', severity: 'severe', supportingFindingIds: [expect.any(String)] }]);
  });

  it('infers upper_cross from rounded_shoulders/elevated_shoulder/thoracic_kyphosis, taking the worst severity', () => {
    const patterns = detectCorrectivePatterns([
      finding({ finding_type: 'rounded_shoulders', severity: 'mild' }),
      finding({ finding_type: 'elevated_shoulder', severity: 'moderate' }),
      finding({ finding_type: 'thoracic_kyphosis', severity: 'significant' }),
    ]);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.blueprint).toBe('upper_cross');
    expect(patterns[0]!.severity).toBe('severe');
    expect(patterns[0]!.supportingFindingIds).toHaveLength(3);
  });

  it('stacks upper_cross + forward_head from independent findings', () => {
    const patterns = detectCorrectivePatterns([
      finding({ finding_type: 'forward_head', severity: 'moderate' }),
      finding({ finding_type: 'rounded_shoulders', severity: 'significant' }),
    ]);
    const blueprints = patterns.map((p) => p.blueprint).sort();
    expect(blueprints).toEqual(['forward_head', 'upper_cross']);
  });

  it('infers flat_back from lumbar_posture only when lower_crossed_pattern is absent', () => {
    const flatBack = detectCorrectivePatterns([finding({ finding_type: 'lumbar_posture', severity: 'moderate' })]);
    expect(flatBack).toEqual([{ blueprint: 'flat_back', severity: 'moderate', supportingFindingIds: [expect.any(String)] }]);

    const bothPresent = detectCorrectivePatterns([
      finding({ finding_type: 'lower_crossed_pattern', severity: 'moderate' }),
      finding({ finding_type: 'lumbar_posture', severity: 'significant' }),
    ]);
    const blueprints = bothPresent.map((p) => p.blueprint);
    expect(blueprints).toEqual(['lower_cross']);
    expect(blueprints).not.toContain('flat_back');
  });

  it('ignores dismissed/superseded/draft findings and none/unknown severities', () => {
    const patterns = detectCorrectivePatterns([
      finding({ finding_type: 'forward_head', severity: 'significant', status: 'dismissed' }),
      finding({ finding_type: 'forward_head', severity: 'significant', status: 'superseded' }),
      finding({ finding_type: 'forward_head', severity: 'significant', status: 'draft' }),
      finding({ finding_type: 'lower_crossed_pattern', severity: 'none', status: 'confirmed' }),
      finding({ finding_type: 'lower_crossed_pattern', severity: 'unknown', status: 'confirmed' }),
    ]);
    expect(patterns).toEqual([]);
  });

  it('overallSeverity is the worst severity across all detected patterns', () => {
    expect(
      overallSeverity([
        { blueprint: 'forward_head', severity: 'mild', supportingFindingIds: [] },
        { blueprint: 'upper_cross', severity: 'severe', supportingFindingIds: [] },
      ])
    ).toBe('severe');
  });
});
