import { describe, it, expect } from 'vitest';
import type { RegistryEntry } from '@mef/shared-types-contracts';
import { buildFindingTimeline } from '../lib/registry/timeline';

function entry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
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

describe('buildFindingTimeline', () => {
  it('groups a whole supersede chain into one timeline entry with real first/last dates and occurrence count', () => {
    const chain: RegistryEntry[] = [
      entry({
        id: 'e1',
        recorded_at: '2026-01-01T00:00:00.000Z',
        status: 'superseded',
        trend_status: 'new',
      }),
      entry({
        id: 'e2',
        recorded_at: '2026-02-01T00:00:00.000Z',
        status: 'superseded',
        trend_status: 'worsening',
        supersedes_id: 'e1',
        severity: 'significant',
      }),
      entry({
        id: 'e3',
        recorded_at: '2026-03-01T00:00:00.000Z',
        status: 'active',
        trend_status: 'improving',
        supersedes_id: 'e2',
        severity: 'mild',
      }),
    ];

    const timeline = buildFindingTimeline(chain);
    expect(timeline).toHaveLength(1);
    const [result] = timeline;
    expect(result!.firstObservedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result!.lastObservedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(result!.occurrenceCount).toBe(3);
    expect(result!.currentTrendStatus).toBe('improving');
    expect(result!.confidenceOverTime).toHaveLength(3);
  });

  it('separates different (domain, code) findings into distinct timeline entries', () => {
    const entries = [
      entry({ id: 'a', domain: 'sleep', code: 'poor_sleep_quality' }),
      entry({ id: 'b', domain: 'stress', code: 'elevated_stress' }),
    ];
    expect(buildFindingTimeline(entries)).toHaveLength(2);
  });

  it('sets resolvedAt when a resolved entry exists in the chain', () => {
    const entries = [
      entry({ id: 'a', recorded_at: '2026-01-01T00:00:00.000Z' }),
      entry({
        id: 'b',
        recorded_at: '2026-02-01T00:00:00.000Z',
        status: 'resolved',
        severity: 'none',
        supersedes_id: 'a',
      }),
    ];
    const [result] = buildFindingTimeline(entries);
    expect(result!.resolvedAt).toBe('2026-02-01T00:00:00.000Z');
  });
});
