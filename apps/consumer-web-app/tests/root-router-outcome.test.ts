/**
 * Unit tests for the Root Router's outcome classification (Prompt 10) —
 * pure functions only, no Supabase client, same convention as
 * investigation-engine.test.ts. Covers all seven named outcomes
 * (Focused Investigation / Lifestyle Experiment / Reflection / Reassessment
 * / Continue Observation / No Action Needed / Coach Review) plus the
 * member-safety rule that no member-facing message ever leaks internal
 * terminology.
 */
import { describe, it, expect } from 'vitest';
import { classifyRouterOutcome } from '../lib/investigation-engine/routerOutcome';
import type { RootRouterDecision } from '../lib/investigation-engine/rootRouter';
import type { Recommendation as IntelligenceRecommendation, CoachingPriorities } from '../lib/intelligence-engine/types';
import type { DomainConfidence } from '../lib/investigation-engine/confidence';

type AttentionLevel = CoachingPriorities['recommendedCoachAttentionLevel'];

function decision(overrides: Partial<RootRouterDecision> = {}): RootRouterDecision {
  return {
    safetyGated: false,
    recommendation: { key: null, reason: 'upgrade_invitation' },
    findingBasedSuggestions: [],
    ...overrides,
  };
}

function rec(overrides: Partial<IntelligenceRecommendation> = {}): IntelligenceRecommendation {
  return {
    domain: 'movement',
    title: 'title',
    detail: 'detail',
    priority: 'medium',
    confidence: 0.7,
    evidence: [],
    ...overrides,
  };
}

function confidences(labels: DomainConfidence['label'][]): DomainConfidence[] {
  return labels.map((label) => ({ label, numeric: 0, corroborated: false }));
}

describe('classifyRouterOutcome', () => {
  it('returns coach_review when safety-gated, regardless of everything else', () => {
    const result = classifyRouterOutcome(
      decision({ safetyGated: true, recommendation: { key: 'short-haq', reason: 'recommended_next' } }),
      'priority',
      [],
      []
    );
    expect(result.outcome).toBe('coach_review');
    expect(result.investigation).toBeNull();
  });

  it('returns coach_review when coach attention level is priority, even without a safety gate', () => {
    const result = classifyRouterOutcome(decision(), 'priority', [], []);
    expect(result.outcome).toBe('coach_review');
  });

  it('returns reassessment when the pick is a due reassessment', () => {
    const result = classifyRouterOutcome(
      decision({ recommendation: { key: 'short-haq', reason: 'required_reassessment' } }),
      'none',
      [],
      []
    );
    expect(result.outcome).toBe('reassessment');
    expect(result.investigation?.key).toBe('short-haq');
  });

  it('returns focused_investigation for any other real recommendation pick', () => {
    const result = classifyRouterOutcome(
      decision({ recommendation: { key: 'four-doctors', reason: 'recommended_next' } }),
      'none',
      [],
      []
    );
    expect(result.outcome).toBe('focused_investigation');
    expect(result.investigation?.key).toBe('four-doctors');
  });

  it('returns focused_investigation from a finding-based suggestion when nothing else was picked', () => {
    const result = classifyRouterOutcome(
      decision({
        findingBasedSuggestions: [
          { assessmentKey: 'body-assessment', reason: 'Based on posture findings.', supportingFindingCodes: ['a'] },
        ],
      }),
      'none',
      [],
      []
    );
    expect(result.outcome).toBe('focused_investigation');
    expect(result.investigation?.key).toBe('body-assessment');
  });

  it('returns lifestyle_experiment when a high/medium behavioral-domain recommendation exists', () => {
    const result = classifyRouterOutcome(decision(), 'none', [rec({ domain: 'sleep', priority: 'high' })], []);
    expect(result.outcome).toBe('lifestyle_experiment');
  });

  it('returns reflection when a reflection/education recommendation exists and no experiment domain matched', () => {
    const result = classifyRouterOutcome(
      decision(),
      'none',
      [rec({ domain: 'reflection', priority: 'medium' })],
      []
    );
    expect(result.outcome).toBe('reflection');
  });

  it('returns continue_observation when most domains are still building', () => {
    const result = classifyRouterOutcome(
      decision(),
      'none',
      [],
      confidences(['building', 'building', 'building', 'high'])
    );
    expect(result.outcome).toBe('continue_observation');
  });

  it('returns no_action_needed when nothing is due and most domains have real confidence', () => {
    const result = classifyRouterOutcome(
      decision(),
      'none',
      [],
      confidences(['high', 'moderate', 'moderate', 'building'])
    );
    expect(result.outcome).toBe('no_action_needed');
  });

  it('never leaks internal terminology in a member-facing message', () => {
    const banned = ['chek', 'hlc', 'four-doctors', 'four_doctors'];
    const outcomes: Array<[RootRouterDecision, AttentionLevel, IntelligenceRecommendation[], DomainConfidence[]]> = [
      [decision({ safetyGated: true }), 'none', [], []],
      [decision(), 'priority', [], []],
      [decision({ recommendation: { key: 'short-haq', reason: 'required_reassessment' } }), 'none', [], []],
      [decision({ recommendation: { key: 'four-doctors', reason: 'recommended_next' } }), 'none', [], []],
      [decision(), 'none', [rec({ domain: 'sleep', priority: 'high' })], []],
      [decision(), 'none', [rec({ domain: 'reflection' })], []],
      [decision(), 'none', [], confidences(['building', 'building'])],
      [decision(), 'none', [], confidences(['high', 'high'])],
    ];

    for (const [d, level, recs, conf] of outcomes) {
      const result = classifyRouterOutcome(d, level, recs, conf);
      const lower = result.memberMessage.toLowerCase();
      for (const term of banned) {
        expect(lower).not.toContain(term);
      }
    }
  });
});
