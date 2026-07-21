import { describe, it, expect } from 'vitest';
import type { DomainScore, RegistryEntry } from '@mef/shared-types-contracts';
import { applyFindingAdjustments } from '../lib/scoring/findingAdjustments';

function domain(overrides: Partial<DomainScore> = {}): DomainScore {
  return {
    domain: 'movement',
    label: 'Movement',
    score: 80,
    confidence_level: 'high',
    direction: 'stable',
    data_points: 10,
    window_days: 30,
    explanation: 'base',
    ...overrides,
  };
}

function finding(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'e1',
    member_id: 'u1',
    entry_kind: 'finding',
    domain: 'movement',
    code: 'hip_asymmetry',
    label: 'Hip Instability',
    severity: 'significant',
    numeric_value: null,
    unit: null,
    confidence: 0.8,
    narrative: null,
    evidence_refs: [],
    source_feature: 'body_assessment_finding',
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

describe('applyFindingAdjustments', () => {
  it('leaves domain scores untouched when there are no active findings', () => {
    const result = applyFindingAdjustments([domain()], []);
    expect(result[0]!.score).toBe(80);
  });

  it('applies a confidence-weighted penalty to the mapped domain', () => {
    const result = applyFindingAdjustments([domain({ score: 80 })], [finding()]);
    // significant (8) * confidence (0.8) = 6.4 -> rounds to 6
    expect(result[0]!.score).toBe(74);
    expect(result[0]!.explanation).toContain('Adjusted for 1 active assessment finding');
  });

  it('never adjusts a domain with score: null', () => {
    const result = applyFindingAdjustments([domain({ score: null })], [finding()]);
    expect(result[0]!.score).toBeNull();
  });

  it('caps the total adjustment per domain', () => {
    const findings = [
      finding({ id: 'a', severity: 'significant', confidence: 1 }),
      finding({ id: 'b', severity: 'significant', confidence: 1, code: 'knee_valgus' }),
      finding({ id: 'c', severity: 'significant', confidence: 1, code: 'foot_turnout' }),
    ];
    const result = applyFindingAdjustments([domain({ score: 50 })], findings);
    // 3 * 8 = 24 raw, capped at 10
    expect(result[0]!.score).toBe(40);
  });

  it('ignores findings from domains with no Root Score mapping', () => {
    const result = applyFindingAdjustments(
      [domain({ domain: 'recovery', score: 80 })],
      [finding({ domain: 'lab' })]
    );
    expect(result[0]!.score).toBe(80);
  });

  it('ignores metric entries (no severity)', () => {
    const result = applyFindingAdjustments(
      [domain({ domain: 'nutrition', score: 80 })],
      [finding({ domain: 'nutrition', entry_kind: 'metric', severity: null })]
    );
    expect(result[0]!.score).toBe(80);
  });
});
