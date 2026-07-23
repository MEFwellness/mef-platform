/**
 * Unit tests for the Root Map builder (Prompt 10) — pure functions only, no
 * Supabase client, same convention as investigation-engine.test.ts. Covers
 * the "always all twelve domains" guarantee, the uninstrumented-domain
 * empty state, corroborated-confidence -> stage inference, and safety
 * suppression for the member view vs. the coach view.
 */
import { describe, it, expect } from 'vitest';
import type { RegistryEntry } from '@mef/shared-types-contracts';
import { buildRootMap } from '../lib/root-map';
import type { RootRouterOutcomeView } from '../lib/investigation-engine/routerOutcome';

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

const NO_ACTION_OUTCOME: RootRouterOutcomeView = {
  outcome: 'no_action_needed',
  memberMessage: 'Nothing urgent right now — things look steady.',
  investigation: null,
};

describe('buildRootMap', () => {
  it('always returns all twelve Coaching Domains, regardless of input', () => {
    const view = buildRootMap({
      activeFindings: [],
      patterns: [],
      routerOutcome: NO_ACTION_OUTCOME,
      safetyGated: false,
      restrictedTopics: [],
    });
    expect(view.domains).toHaveLength(12);
  });

  it('shows the uninstrumented-domain empty state, never a blank/undefined section', () => {
    const view = buildRootMap({
      activeFindings: [],
      patterns: [],
      routerOutcome: NO_ACTION_OUTCOME,
      safetyGated: false,
      restrictedTopics: [],
    });
    const identity = view.domains.find((d) => d.domain === 'identity_self_concept')!;
    expect(identity.isUninstrumented).toBe(true);
    expect(identity.stage).toBe('discovery');
    expect(identity.whatWeUnderstand).toEqual([]);
    expect(identity.whatWereStillLearning).toMatch(/doesn't have a dedicated assessment/);
  });

  it('reaches at least moderate confidence and a non-discovery stage once two distinct investigations corroborate', () => {
    const view = buildRootMap({
      activeFindings: [
        finding({ domain: 'stress', confidence: 0.3, source_feature: 'questionnaire_category_finding' }),
        finding({ domain: 'stress', confidence: 0.3, source_feature: 'onboarding_baseline_finding', code: 'b' }),
      ],
      patterns: [],
      routerOutcome: NO_ACTION_OUTCOME,
      safetyGated: false,
      restrictedTopics: [],
    });
    const stress = view.domains.find((d) => d.domain === 'stress_nervous_system')!;
    expect(stress.confidence.label).toBe('moderate');
    expect(stress.confidence.corroborated).toBe(true);
    expect(stress.stage).not.toBe('discovery');
    expect(stress.whatWeUnderstand.length).toBeGreaterThan(0);
  });

  it('suppresses detail across every domain for the member view when a safety topic is restricted', () => {
    const view = buildRootMap({
      activeFindings: [finding({ domain: 'stress', confidence: 0.8 })],
      patterns: [],
      routerOutcome: NO_ACTION_OUTCOME,
      safetyGated: true,
      restrictedTopics: ['stress'],
    });
    const stress = view.domains.find((d) => d.domain === 'stress_nervous_system')!;
    expect(stress.whatWeUnderstand).toEqual([]);
    expect(stress.patterns).toEqual([]);
    expect(stress.whatWereStillLearning).toMatch(/reviewing something/);
    // A member never sees the raw restricted-topic list about themselves.
    expect(view.restrictedTopics).toEqual([]);
  });

  it('does not suppress detail for the coach view, and echoes restrictedTopics back', () => {
    const view = buildRootMap({
      activeFindings: [finding({ domain: 'stress', confidence: 0.8 })],
      patterns: [],
      routerOutcome: NO_ACTION_OUTCOME,
      safetyGated: true,
      restrictedTopics: ['stress'],
      coachView: true,
    });
    const stress = view.domains.find((d) => d.domain === 'stress_nervous_system')!;
    expect(stress.whatWeUnderstand.length).toBeGreaterThan(0);
    expect(view.restrictedTopics).toEqual(['stress']);
  });

  it('every domain always has non-empty currentRecommendation and nextSuggestedStep', () => {
    const view = buildRootMap({
      activeFindings: [],
      patterns: [],
      routerOutcome: NO_ACTION_OUTCOME,
      safetyGated: false,
      restrictedTopics: [],
    });
    for (const domain of view.domains) {
      expect(domain.currentRecommendation.length).toBeGreaterThan(0);
      expect(domain.nextSuggestedStep.length).toBeGreaterThan(0);
    }
  });
});
