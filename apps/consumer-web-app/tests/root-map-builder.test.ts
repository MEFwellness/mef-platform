/**
 * The Root Map builder, after the Member Interpretation Layer migration.
 *
 * The builder no longer computes domain confidence or domain priority over
 * raw registry rows; it renders the layer's `DomainInterpretation[]`. So
 * these tests feed it interpretations. What used to be asserted here about
 * corroboration and severity is asserted one level down, in
 * tests/member-interpretation-layer.test.ts.
 *
 * Still covered here, because they are this module's own guarantees: always
 * all twelve domains, the uninstrumented empty state, safety suppression
 * for the member view versus the coach view, and every domain always having
 * a real next step.
 */
import { describe, it, expect } from 'vitest';
import { buildRootMap } from '../lib/root-map';
import type { RootRouterOutcomeView } from '../lib/investigation-engine/routerOutcome';
import { buildDomainInterpretations } from '../lib/member-interpretation/domains';
import type { CanonicalFinding } from '../lib/member-interpretation/types';

function finding(overrides: Partial<CanonicalFinding> = {}): CanonicalFinding {
  return {
    id: 'stress::elevated_stress',
    sourceKey: 'stress::elevated_stress',
    label: 'Elevated Stress',
    statement: 'Elevated Stress came up in your intake answers. One signal so far.',
    tier: 'early_indication',
    tierLabel: 'Early indication',
    evidence: [],
    verdict: 'worth_watching',
    severity: 'moderate',
    primaryDomain: 'stress_nervous_system',
    primaryDomainLabel: 'Stress & Nervous System Regulation',
    alsoRelevantDomains: ['emotional_resilience_mood'],
    crossReferenceNote: 'Also shown under Emotional Resilience & Mood.',
    memberVisible: true,
    registryEntryId: 'e1',
    ...overrides,
  };
}

function domains(findings: CanonicalFinding[], suppressed = false) {
  return buildDomainInterpretations({ findings, loggedDaysByDomain: {}, suppressed });
}

const NO_ACTION_OUTCOME: RootRouterOutcomeView = {
  outcome: 'no_action_needed',
  memberMessage: 'Nothing urgent right now, things look steady.',
  investigation: null,
};

describe('buildRootMap', () => {
  it('always returns all twelve Coaching Domains, regardless of input', () => {
    const view = buildRootMap({
      domains: domains([]),
      patterns: [],
      routerOutcome: NO_ACTION_OUTCOME,
      safetyGated: false,
      restrictedTopics: [],
    });
    expect(view.domains).toHaveLength(12);
  });

  it('shows the uninstrumented-domain empty state, never a blank/undefined section', () => {
    const view = buildRootMap({
      domains: domains([]),
      patterns: [],
      routerOutcome: NO_ACTION_OUTCOME,
      safetyGated: false,
      restrictedTopics: [],
    });
    const identity = view.domains.find((d) => d.domain === 'identity_self_concept')!;
    expect(identity.isUninstrumented).toBe(true);
    expect(identity.stage).toBe('discovery');
    expect(identity.whatWeUnderstand).toEqual([]);
    expect(identity.state).toBe('not_covered');
    expect(identity.whatWereStillLearning).toMatch(/no assessment covering/i);
  });

  it('renders a finding in full on its primary domain and as a reference elsewhere', () => {
    const view = buildRootMap({
      domains: domains([finding()]),
      patterns: [],
      routerOutcome: NO_ACTION_OUTCOME,
      safetyGated: false,
      restrictedTopics: [],
    });
    const stress = view.domains.find((d) => d.domain === 'stress_nervous_system')!;
    const mood = view.domains.find((d) => d.domain === 'emotional_resilience_mood')!;

    expect(stress.canonicalFindings).toHaveLength(1);
    expect(stress.whatWeUnderstand).toHaveLength(1);
    expect(mood.canonicalFindings).toHaveLength(0);
    expect(mood.crossReferenced).toHaveLength(1);
    expect(view.domains.reduce((n, d) => n + d.whatWeUnderstand.length, 0)).toBe(1);
  });

  it('maps the layer state onto the legacy priority shim without ever landing on quiet over a live finding', () => {
    const view = buildRootMap({
      domains: domains([finding({ verdict: 'noted', severity: 'mild' })]),
      patterns: [],
      routerOutcome: NO_ACTION_OUTCOME,
      safetyGated: false,
      restrictedTopics: [],
    });
    const stress = view.domains.find((d) => d.domain === 'stress_nervous_system')!;
    expect(stress.state).toBe('acknowledged');
    expect(stress.priority).not.toBe('quiet');
  });

  it('suppresses detail across every domain for the member view when a safety topic is restricted', () => {
    const view = buildRootMap({
      domains: domains([], true),
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
      domains: domains([finding()]),
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
      domains: domains([]),
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

  /**
   * The phrase the audit caught on a card that listed two active findings.
   * It is gone from the builder's own vocabulary, not merely unreachable.
   */
  it('no domain can ever say "looking steady" or "nothing specific needed"', () => {
    const view = buildRootMap({
      domains: domains([finding({ verdict: 'noted', severity: 'mild' })]),
      patterns: [],
      routerOutcome: NO_ACTION_OUTCOME,
      safetyGated: false,
      restrictedTopics: [],
    });
    for (const domain of view.domains) {
      const text =
        `${domain.currentRecommendation} ${domain.nextSuggestedStep} ${domain.whatWereStillLearning}`.toLowerCase();
      expect(text).not.toContain('looking steady');
      expect(text).not.toContain('nothing specific needed');
    }
  });
});
