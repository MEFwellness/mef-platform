/**
 * Pure unit tests for lib/intelligence-engine/registryFindings.ts — same
 * fixture-builder style as tests/intelligence-engine-patterns.test.ts, no
 * Supabase involved.
 */
import { describe, it, expect } from 'vitest';
import {
  buildRegistryPatternInsights,
  buildRegistryCoachAlertDrafts,
} from '../lib/intelligence-engine/registryFindings';
import type { MemberHealthProfile } from '../lib/intelligence-engine/types';
import type { RegistryEntry } from '@mef/shared-types-contracts';

function makeProfile(registryEntries: RegistryEntry[]): MemberHealthProfile {
  return {
    memberId: 'member-1',
    localDate: '2024-01-01',
    checkinsOldestFirst: [],
    baseline: null,
    latestReassessment: null,
    comparison: [],
    progressSummary: {
      improved: [],
      declined: [],
      stable: [],
      overallDirection: 'insufficient_data',
    } as never,
    narrativeItems: [],
    wellnessInsights: [],
    feedHistoryPairs: [],
    brainDecision: {} as never,
    streak: { daysSinceLastCheckin: null } as never,
    adherence: { level: 'insufficient_data', sampleSize: 0 } as never,
    restrictedTopics: [],
    openSafetyReviewCount: 0,
    coachNotesCount: 0,
    daysSinceLastReassessmentOrBaseline: null,
    registryEntries,
  };
}

function makeEntry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'entry-1',
    member_id: 'member-1',
    entry_kind: 'finding',
    domain: 'posture',
    code: 'forward_head',
    label: 'forward head',
    severity: 'moderate',
    numeric_value: null,
    unit: null,
    confidence: 0.75,
    narrative: 'Forward head posture noted on both sides.',
    evidence_refs: [{ type: 'capture', id: 'capture-1' }],
    source_feature: 'body_assessment_finding',
    source_record_id: 'finding-1',
    status: 'active',
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    supersedes_id: null,
    superseded_by_id: null,
    recorded_at: '2024-01-01T00:00:00.000Z',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildRegistryPatternInsights', () => {
  it('returns one PatternInsight per active finding with a mild/moderate/significant severity', () => {
    const profile = makeProfile([makeEntry()]);
    const patterns = buildRegistryPatternInsights(profile);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.kind).toBe('body_assessment_finding');
    expect(patterns[0]!.key).toBe('registry_posture_forward_head');
    expect(patterns[0]!.evidenceRefs).toContainEqual({ type: 'registry_entry', id: 'entry-1' });
  });

  it('excludes entries with severity none/unknown, non-finding entries, and non-active entries', () => {
    const profile = makeProfile([
      makeEntry({ id: 'e-none', severity: 'none' }),
      makeEntry({ id: 'e-unknown', severity: 'unknown' }),
      makeEntry({ id: 'e-metric', entry_kind: 'metric', severity: null }),
      makeEntry({ id: 'e-superseded', status: 'superseded' }),
    ]);
    expect(buildRegistryPatternInsights(profile)).toHaveLength(0);
  });

  it('empty registry produces no patterns', () => {
    expect(buildRegistryPatternInsights(makeProfile([]))).toEqual([]);
  });
});

describe('buildRegistryCoachAlertDrafts', () => {
  it('produces an alert only for significant-severity active findings', () => {
    const profile = makeProfile([
      makeEntry({ id: 'e-mild', code: 'mild_finding', severity: 'mild' }),
      makeEntry({ id: 'e-significant', code: 'significant_finding', severity: 'significant' }),
    ]);
    const alerts = buildRegistryCoachAlertDrafts(profile);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.alertType).toBe('assessment_finding_requires_attention');
    expect(alerts[0]!.severity).toBe('important');
    expect(alerts[0]!.alertKey).toBe('assessment_finding_significant_finding');
  });

  it('empty registry produces no alerts', () => {
    expect(buildRegistryCoachAlertDrafts(makeProfile([]))).toEqual([]);
  });
});
