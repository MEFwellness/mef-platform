import { describe, it, expect } from 'vitest';
import type { RegistryEntry } from '@mef/shared-types-contracts';
import { buildMemberFacingNoticing } from '../lib/intelligence-engine/memberFacingNoticing';

function finding(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'e1',
    member_id: 'u1',
    entry_kind: 'finding',
    domain: 'sleep',
    code: 'poor_sleep_quality',
    label: 'Poor Sleep Quality',
    severity: 'moderate',
    numeric_value: null,
    unit: null,
    confidence: 0.6,
    narrative: 'Sleep quality has been poor recently.',
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

describe('buildMemberFacingNoticing', () => {
  it('surfaces an active, member-visible finding under "noticing"', () => {
    const result = buildMemberFacingNoticing([finding()], []);
    expect(result.noticing).toEqual(['Sleep quality has been poor recently.']);
  });

  it('excludes a coach-only (member_visible=false) finding entirely', () => {
    const result = buildMemberFacingNoticing([finding({ member_visible: false })], []);
    expect(result.noticing).toHaveLength(0);
    expect(result.improving).toHaveLength(0);
  });

  it('surfaces an improving-trend finding under "improving"', () => {
    const result = buildMemberFacingNoticing([finding({ trend_status: 'improving' })], []);
    expect(result.improving[0]).toContain('improving');
  });

  it('surfaces a resolved (severity: none) finding under "improving"', () => {
    const result = buildMemberFacingNoticing([finding({ severity: 'none' })], []);
    expect(result.improving).toHaveLength(1);
  });

  it('puts moderate/significant findings under "worthAttention"', () => {
    const result = buildMemberFacingNoticing([finding({ severity: 'significant' })], []);
    expect(result.worthAttention).toEqual(['Poor Sleep Quality']);
  });

  it('does not put mild findings under "worthAttention"', () => {
    const result = buildMemberFacingNoticing([finding({ severity: 'mild' })], []);
    expect(result.worthAttention).toHaveLength(0);
  });

  it('carries suggestion reasons through as next steps', () => {
    const result = buildMemberFacingNoticing(
      [finding()],
      [
        {
          assessmentKey: 'four-doctors',
          reason: 'Based on sleep patterns noticed recently.',
          supportingFindingCodes: ['poor_sleep_quality'],
        },
      ]
    );
    expect(result.nextSteps).toEqual(['Based on sleep patterns noticed recently.']);
  });

  it('includes an educational note for a touched domain', () => {
    const result = buildMemberFacingNoticing([finding()], []);
    expect(result.educationalNotes.length).toBeGreaterThan(0);
  });

  it('returns all-empty when there are no findings', () => {
    const result = buildMemberFacingNoticing([], []);
    expect(result.noticing).toHaveLength(0);
    expect(result.improving).toHaveLength(0);
    expect(result.worthAttention).toHaveLength(0);
    expect(result.educationalNotes).toHaveLength(0);
  });
});
