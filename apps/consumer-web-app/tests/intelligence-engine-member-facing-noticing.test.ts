/**
 * "What We're Noticing", after the Member Interpretation Layer migration.
 *
 * This module no longer reads registry rows and no longer decides what any
 * of them mean, so these tests feed it canonical findings, which is the
 * only thing it takes now. Everything that used to be asserted here about
 * severity, trend and visibility is asserted one level down, in
 * tests/member-interpretation-layer.test.ts, where those decisions moved.
 */
import { describe, it, expect } from 'vitest';
import { buildMemberFacingNoticing } from '../lib/intelligence-engine/memberFacingNoticing';
import type { CanonicalFinding } from '../lib/member-interpretation/types';

function finding(overrides: Partial<CanonicalFinding> = {}): CanonicalFinding {
  return {
    id: 'sleep::poor_sleep_quality',
    sourceKey: 'sleep::poor_sleep_quality',
    label: 'Poor Sleep Quality',
    statement: 'Poor Sleep Quality came up in your intake answers. One signal so far.',
    tier: 'early_indication',
    tierLabel: 'Early indication',
    evidence: [],
    verdict: 'worth_watching',
    severity: 'moderate',
    primaryDomain: 'sleep_circadian_rhythm',
    primaryDomainLabel: 'Sleep & Circadian Rhythm',
    alsoRelevantDomains: ['recovery_energy_regulation'],
    crossReferenceNote: 'Also shown under Recovery & Energy Regulation.',
    memberVisible: true,
    registryEntryId: 'e1',
    ...overrides,
  };
}

describe('buildMemberFacingNoticing', () => {
  it('surfaces a member-visible finding under "noticing", with its tier', () => {
    const result = buildMemberFacingNoticing({ findings: [finding()], dataFloorNote: null });
    expect(result.noticing).toHaveLength(1);
    expect(result.noticing[0]!.statement).toContain('Poor Sleep Quality');
    expect(result.noticing[0]!.tierLabel).toBe('Early indication');
  });

  it('excludes a coach-only finding entirely', () => {
    const result = buildMemberFacingNoticing({
      findings: [finding({ memberVisible: false })],
      dataFloorNote: null,
    });
    expect(result.noticing).toHaveLength(0);
    expect(result.improving).toHaveLength(0);
  });

  it('puts an improving finding under "improving" and not under "noticing"', () => {
    const result = buildMemberFacingNoticing({
      findings: [finding({ verdict: 'improving' })],
      dataFloorNote: null,
    });
    expect(result.improving).toHaveLength(1);
    expect(result.noticing).toHaveLength(0);
  });

  it('does not list a resolved finding at all', () => {
    const result = buildMemberFacingNoticing({
      findings: [finding({ verdict: 'resolved' })],
      dataFloorNote: null,
    });
    expect(result.noticing).toHaveLength(0);
    expect(result.improving).toHaveLength(0);
  });

  /**
   * The audit's own duplication, and why the field is gone rather than
   * filtered. `worthAttention` mapped the moderate/significant subset of the
   * SAME list to its bare label, so four of six bullets appeared twice on
   * one screen. Urgency is a flag on the finding now.
   */
  it('has no second list that could repeat the first', () => {
    const result = buildMemberFacingNoticing({
      findings: [finding({ verdict: 'needs_attention' })],
      dataFloorNote: null,
    });
    expect(result).not.toHaveProperty('worthAttention');
    expect(result.noticing).toHaveLength(1);
    expect(result.noticing[0]!.needsAttention).toBe(true);
  });

  it('marks a non-urgent finding as not needing attention rather than dropping it', () => {
    const result = buildMemberFacingNoticing({
      findings: [finding({ verdict: 'noted' })],
      dataFloorNote: null,
    });
    expect(result.noticing[0]!.needsAttention).toBe(false);
  });

  it('carries the cross reference through, so one answer reads as one finding', () => {
    const result = buildMemberFacingNoticing({ findings: [finding()], dataFloorNote: null });
    expect(result.noticing[0]!.crossReferenceNote).toBe(
      'Also shown under Recovery & Energy Regulation.'
    );
  });

  it('has no nextSteps field at all, there was never a real step behind it', () => {
    const result = buildMemberFacingNoticing({ findings: [finding()], dataFloorNote: null });
    expect(result).not.toHaveProperty('nextSteps');
  });

  it('includes one educational note per touched domain, never one per finding', () => {
    const result = buildMemberFacingNoticing({
      findings: [
        finding({ id: 'a', sourceKey: 'a' }),
        finding({ id: 'b', sourceKey: 'b', label: 'Something else' }),
      ],
      dataFloorNote: null,
    });
    expect(result.educationalNotes).toHaveLength(1);
  });

  it('carries the data floor note through when the floor is not met', () => {
    const result = buildMemberFacingNoticing({
      findings: [finding()],
      dataFloorNote: 'You have 3 logged days so far.',
    });
    expect(result.dataFloorNote).toBe('You have 3 logged days so far.');
  });

  it('returns all-empty when there are no findings', () => {
    const result = buildMemberFacingNoticing({ findings: [], dataFloorNote: null });
    expect(result.noticing).toHaveLength(0);
    expect(result.improving).toHaveLength(0);
    expect(result.educationalNotes).toHaveLength(0);
  });
});
