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
    const result = buildMemberFacingNoticing([finding()]);
    expect(result.noticing).toEqual(['Sleep quality has been poor recently.']);
  });

  it('excludes a coach-only (member_visible=false) finding entirely', () => {
    const result = buildMemberFacingNoticing([finding({ member_visible: false })]);
    expect(result.noticing).toHaveLength(0);
    expect(result.improving).toHaveLength(0);
  });

  it('surfaces an improving-trend finding under "improving"', () => {
    const result = buildMemberFacingNoticing([finding({ trend_status: 'improving' })]);
    expect(result.improving[0]).toContain('improving');
  });

  // Honesty guard (2026-08-17). This used to assert the opposite: that a
  // severity 'none' finding counted as improving. It does not. Severity
  // 'none' means the producer found nothing, not that something got better,
  // and it was reaching the member as "Packaged food scan has been
  // improving." off a single barcode scan with no second data point and no
  // trend of any kind. Improving now requires a real computed
  // trend_status of 'improving' (lib/registry/trendStatus.ts).
  it('does not call a severity "none" finding improving, since nothing found is not progress', () => {
    const result = buildMemberFacingNoticing([finding({ severity: 'none' })]);
    expect(result.improving).toHaveLength(0);
  });

  it('still calls a severity "none" finding improving when it carries a real improving trend', () => {
    const result = buildMemberFacingNoticing([
      finding({ severity: 'none', trend_status: 'improving' }),
    ]);
    expect(result.improving).toHaveLength(1);
  });

  it('puts moderate/significant findings under "worthAttention"', () => {
    const result = buildMemberFacingNoticing([finding({ severity: 'significant' })]);
    expect(result.worthAttention).toEqual(['Poor Sleep Quality']);
  });

  it('does not put mild findings under "worthAttention"', () => {
    const result = buildMemberFacingNoticing([finding({ severity: 'mild' })]);
    expect(result.worthAttention).toHaveLength(0);
  });

  // Guard for the "Suggested Next Steps" bug (confirmed live on
  // app.mefwellness.com): the view used to carry a `nextSteps` field built
  // from FindingBasedSuggestion.reason — only ever the WHY ("Based on
  // stress and lifestyle balance noticed recently."), never an actual
  // step, because no step/title/link was ever computed anywhere in that
  // pipeline. There is no fix that "restores" a step that was never
  // computed, so the field itself is gone — this pins that down instead
  // of leaving a heading with only reasoning text under it.
  it('has no nextSteps field at all — there was never a real step behind it', () => {
    const result = buildMemberFacingNoticing([finding({ severity: 'significant' })]);
    expect(result).not.toHaveProperty('nextSteps');
  });

  it('includes an educational note for a touched domain', () => {
    const result = buildMemberFacingNoticing([finding()]);
    expect(result.educationalNotes.length).toBeGreaterThan(0);
  });

  it('returns all-empty when there are no findings', () => {
    const result = buildMemberFacingNoticing([]);
    expect(result.noticing).toHaveLength(0);
    expect(result.improving).toHaveLength(0);
    expect(result.worthAttention).toHaveLength(0);
    expect(result.educationalNotes).toHaveLength(0);
  });
});
