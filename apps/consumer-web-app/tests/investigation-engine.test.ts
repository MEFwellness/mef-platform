/**
 * Unit tests for the Investigation Engine foundation (Prompt 9) — pure
 * functions only, no Supabase client, same convention as
 * reassessment-intelligence.test.ts. RLS/integration behavior for the new
 * migration and the short-haq registry adapter is covered separately in
 * short-haq-registry-adapter.test.ts.
 */
import { describe, it, expect } from 'vitest';
import type { RegistryEntry } from '@mef/shared-types-contracts';
import { computeCoachingDomainPriority, isInvestigationUnlocked } from '../lib/investigation-engine/unlockEngine';
import { computeDomainConfidence } from '../lib/investigation-engine/confidence';
import { INVESTIGATION_METADATA, getInvestigationMetadata } from '../lib/investigation-engine/registry';
import { COACHING_DOMAINS, COACHING_DOMAIN_TO_REGISTRY_DOMAIN } from '../lib/investigation-engine/domains';
import { evaluateCalendarReassessmentTriggers } from '../lib/reassessment-intelligence/service';

function finding(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'e1',
    member_id: 'u1',
    entry_kind: 'finding',
    domain: 'stress',
    code: 'elevated_stress',
    label: 'Elevated Stress',
    severity: 'moderate',
    numeric_value: null,
    unit: null,
    confidence: 0.6,
    narrative: null,
    evidence_refs: [],
    source_feature: 'questionnaire_category_finding',
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

describe('domains.ts reconciliation tables', () => {
  it('has an entry in every reconciliation map for all twelve Coaching Domains', () => {
    expect(COACHING_DOMAINS).toHaveLength(12);
    for (const { domain } of COACHING_DOMAINS) {
      expect(COACHING_DOMAIN_TO_REGISTRY_DOMAIN[domain]).toBeDefined();
    }
  });

  it('flags exactly the four Method Recommendation 2 domains as uninstrumented', () => {
    const uninstrumented = COACHING_DOMAINS.filter((d) => d.isUninstrumented).map((d) => d.domain);
    expect(uninstrumented.sort()).toEqual(
      [
        'environment_daily_rhythm',
        'identity_self_concept',
        'purpose_motivation',
        'relationships_social_connection',
      ].sort()
    );
  });
});

describe('registry.ts INVESTIGATION_METADATA', () => {
  it('has an entry for every AssessmentKey the real Assessment Registry defines', () => {
    const keys = Object.keys(INVESTIGATION_METADATA);
    expect(keys.sort()).toEqual(
      [
        'onboarding-health-history',
        'chek-hlc1-nutrition-lifestyle',
        'four-doctors',
        'primal-pattern-diet-type',
        'body-assessment',
        'readiness-to-change',
        'short-haq',
        'finding-1-love',
      ].sort()
    );
  });

  it('getInvestigationMetadata returns the matching record', () => {
    expect(getInvestigationMetadata('short-haq').key).toBe('short-haq');
  });
});

describe('computeCoachingDomainPriority', () => {
  it('is quiet with no matching findings', () => {
    expect(computeCoachingDomainPriority('stress_nervous_system', [])).toBe('quiet');
  });

  it('is worth_watching with a moderate active finding in the mapped domain', () => {
    const level = computeCoachingDomainPriority('stress_nervous_system', [
      finding({ domain: 'stress', severity: 'moderate' }),
    ]);
    expect(level).toBe('worth_watching');
  });

  it('is needs_attention_now with a significant active finding', () => {
    const level = computeCoachingDomainPriority('stress_nervous_system', [
      finding({ domain: 'stress', severity: 'significant' }),
    ]);
    expect(level).toBe('needs_attention_now');
  });

  it('ignores a superseded finding', () => {
    const level = computeCoachingDomainPriority('stress_nervous_system', [
      finding({ domain: 'stress', severity: 'significant', status: 'superseded' }),
    ]);
    expect(level).toBe('quiet');
  });

  it('is quiet for a domain with no RegistryDomain mapping (e.g. Identity)', () => {
    const level = computeCoachingDomainPriority('identity_self_concept', [
      finding({ domain: 'stress', severity: 'significant' }),
    ]);
    expect(level).toBe('quiet');
  });
});

describe('isInvestigationUnlocked', () => {
  it('blocks a Focused investigation whose required prior is not completed', () => {
    const unlocked = isInvestigationUnlocked(getInvestigationMetadata('short-haq'), {
      activeFindings: [],
      completedInvestigationKeys: new Set(),
    });
    expect(unlocked).toBe(false);
  });

  it('unlocks once the required prior is completed and member_initiated is always available', () => {
    const unlocked = isInvestigationUnlocked(getInvestigationMetadata('short-haq'), {
      activeFindings: [],
      completedInvestigationKeys: new Set(['onboarding-health-history']),
    });
    expect(unlocked).toBe(true);
  });

  it('a Core investigation with zero declared triggers unlocks with no priors required', () => {
    const unlocked = isInvestigationUnlocked(getInvestigationMetadata('onboarding-health-history'), {
      activeFindings: [],
      completedInvestigationKeys: new Set(),
    });
    expect(unlocked).toBe(true);
  });

  it('unlocks four-doctors via a priority trigger once the Foundational Investigation flags a mapped domain', () => {
    const unlocked = isInvestigationUnlocked(getInvestigationMetadata('four-doctors'), {
      activeFindings: [finding({ domain: 'sleep', code: 'poor_sleep_quality', severity: 'significant' })],
      completedInvestigationKeys: new Set(['onboarding-health-history']),
    });
    expect(unlocked).toBe(true);
  });
});

describe('computeDomainConfidence', () => {
  it('is building with no active findings', () => {
    expect(computeDomainConfidence('stress_nervous_system', [])).toEqual({
      label: 'building',
      numeric: 0,
      corroborated: false,
    });
  });

  it('reflects a single strong finding without corroboration', () => {
    const result = computeDomainConfidence('stress_nervous_system', [
      finding({ domain: 'stress', confidence: 0.8, source_feature: 'questionnaire_category_finding' }),
    ]);
    expect(result.corroborated).toBe(false);
    expect(result.numeric).toBe(0.8);
    expect(result.label).toBe('high');
  });

  it('grants a moderate floor when two distinct investigations corroborate, even if both were individually low', () => {
    const result = computeDomainConfidence('stress_nervous_system', [
      finding({ domain: 'stress', confidence: 0.3, source_feature: 'questionnaire_category_finding' }),
      finding({ domain: 'stress', confidence: 0.3, source_feature: 'onboarding_baseline_finding' }),
    ]);
    expect(result.corroborated).toBe(true);
    expect(result.numeric).toBeGreaterThanOrEqual(0.5);
    expect(result.label).toBe('moderate');
  });

  it('does not corroborate two entries from the same source_feature (same instrument)', () => {
    const result = computeDomainConfidence('stress_nervous_system', [
      finding({ domain: 'stress', confidence: 0.3, source_feature: 'questionnaire_category_finding', code: 'a' }),
      finding({ domain: 'stress', confidence: 0.3, source_feature: 'questionnaire_category_finding', code: 'b' }),
    ]);
    expect(result.corroborated).toBe(false);
    expect(result.numeric).toBe(0.3);
  });

  it('uses the exact real corroboration formula (min(0.9, avg + 0.1)) when it exceeds the moderate floor', () => {
    const result = computeDomainConfidence('stress_nervous_system', [
      finding({ domain: 'stress', confidence: 0.7, source_feature: 'questionnaire_category_finding' }),
      finding({ domain: 'stress', confidence: 0.75, source_feature: 'onboarding_baseline_finding' }),
    ]);
    // avg(0.7, 0.75) + 0.1 = 0.825
    expect(result.numeric).toBe(0.83);
    expect(result.label).toBe('high');
  });
});

describe('evaluateCalendarReassessmentTriggers', () => {
  it('produces no suggestions today, because no live investigation declares a calendar cadence', () => {
    const result = evaluateCalendarReassessmentTriggers(
      new Date('2026-06-01T00:00:00.000Z'),
      new Map([['short-haq', '2026-01-01T00:00:00.000Z']]),
      new Set()
    );
    expect(result).toHaveLength(0);
  });
});
