/**
 * Unit tests for the Root Router's Prompt 12 adaptive extensions —
 * adjust_active_experiment / educational_insight /
 * suggest_coaching_conversation outcomes, the two-active-experiment
 * guardrail, dismissed-domain suppression, and coach-requested
 * reassessment precedence. Same pure, no-Supabase-client convention as
 * tests/root-router-outcome.test.ts, which continues to cover the
 * original seven outcomes unchanged.
 */
import { describe, it, expect } from 'vitest';
import { classifyRouterOutcome, MAX_ACTIVE_EXPERIMENTS, type AdaptiveRouterContext } from '../lib/investigation-engine/routerOutcome';
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

function context(overrides: Partial<AdaptiveRouterContext> = {}): AdaptiveRouterContext {
  return {
    activeExperimentCount: 0,
    activeExperimentDomains: new Set(),
    recentlyDismissedDomains: new Set(),
    hasCoachRequestedReassessment: false,
    ...overrides,
  };
}

const NO_CONF: DomainConfidence[] = [];

describe('classifyRouterOutcome — two-active-experiment guardrail', () => {
  it('MAX_ACTIVE_EXPERIMENTS is 2', () => {
    expect(MAX_ACTIVE_EXPERIMENTS).toBe(2);
  });

  it('routes to lifestyle_experiment when under the cap', () => {
    const result = classifyRouterOutcome(
      decision(),
      'none',
      [rec({ domain: 'sleep', priority: 'high' })],
      NO_CONF,
      context({ activeExperimentCount: 1 })
    );
    expect(result.outcome).toBe('lifestyle_experiment');
  });

  it('routes to adjust_active_experiment when at the cap and an active experiment covers a related domain', () => {
    const result = classifyRouterOutcome(
      decision(),
      'none',
      [rec({ domain: 'sleep', priority: 'high' })],
      NO_CONF,
      context({ activeExperimentCount: 2, activeExperimentDomains: new Set(['sleep']) })
    );
    expect(result.outcome).toBe('adjust_active_experiment');
  });

  it('never exceeds the cap: falls through to the next branch when at cap with no related active experiment', () => {
    const result = classifyRouterOutcome(
      decision(),
      'none',
      [rec({ domain: 'sleep', priority: 'high' }), rec({ domain: 'reflection' })],
      NO_CONF,
      context({ activeExperimentCount: 2, activeExperimentDomains: new Set(['nutrition']) })
    );
    expect(result.outcome).not.toBe('lifestyle_experiment');
    expect(result.outcome).not.toBe('adjust_active_experiment');
  });
});

describe('classifyRouterOutcome — new outcomes', () => {
  it('returns suggest_coaching_conversation for a coach_follow_up recommendation that is not safety/priority-gated', () => {
    const result = classifyRouterOutcome(
      decision(),
      'none',
      [rec({ domain: 'coach_follow_up', priority: 'medium' })],
      NO_CONF,
      context()
    );
    expect(result.outcome).toBe('suggest_coaching_conversation');
  });

  it('returns educational_insight for an education-domain recommendation', () => {
    const result = classifyRouterOutcome(
      decision(),
      'none',
      [rec({ domain: 'education' })],
      NO_CONF,
      context()
    );
    expect(result.outcome).toBe('educational_insight');
  });

  it('still returns reflection for a reflection-domain recommendation (education is now split out separately)', () => {
    const result = classifyRouterOutcome(
      decision(),
      'none',
      [rec({ domain: 'reflection' })],
      NO_CONF,
      context()
    );
    expect(result.outcome).toBe('reflection');
  });
});

describe('classifyRouterOutcome — dismissal suppression', () => {
  it('suppresses an experiment candidate whose domain was recently dismissed, falling through instead', () => {
    const result = classifyRouterOutcome(
      decision(),
      'none',
      [rec({ domain: 'sleep', priority: 'high' })],
      NO_CONF,
      context({ recentlyDismissedDomains: new Set(['sleep']) })
    );
    expect(result.outcome).not.toBe('lifestyle_experiment');
  });

  it('suppresses a coach_follow_up candidate whose domain was recently dismissed', () => {
    const result = classifyRouterOutcome(
      decision(),
      'none',
      [rec({ domain: 'coach_follow_up' })],
      NO_CONF,
      context({ recentlyDismissedDomains: new Set(['coach_follow_up']) })
    );
    expect(result.outcome).not.toBe('suggest_coaching_conversation');
  });
});

describe('classifyRouterOutcome — coach-requested reassessment precedence', () => {
  it('routes to reassessment when a coach has requested one, even with no other reassessment signal', () => {
    const result = classifyRouterOutcome(
      decision(),
      'none',
      [],
      NO_CONF,
      context({ hasCoachRequestedReassessment: true })
    );
    expect(result.outcome).toBe('reassessment');
  });

  it('safety gating still overrides a coach-requested reassessment', () => {
    const result = classifyRouterOutcome(
      decision({ safetyGated: true }),
      'none',
      [],
      NO_CONF,
      context({ hasCoachRequestedReassessment: true })
    );
    expect(result.outcome).toBe('coach_review');
  });
});

describe('classifyRouterOutcome — default adaptive context preserves original 7-outcome behavior', () => {
  it('behaves the same as the pre-Prompt-12 signature when no adaptive context is passed', () => {
    const result = classifyRouterOutcome(decision(), 'none', [rec({ domain: 'sleep', priority: 'high' })], NO_CONF);
    expect(result.outcome).toBe('lifestyle_experiment');
  });
});

describe('classifyRouterOutcome — member-safe messages for new outcomes', () => {
  it('never leaks internal terminology for adjust_active_experiment / educational_insight / suggest_coaching_conversation', () => {
    const banned = ['chek', 'hlc', 'algorithm', 'confidence'];
    const cases: [RootRouterDecision, AttentionLevel, IntelligenceRecommendation[], AdaptiveRouterContext][] = [
      [decision(), 'none', [rec({ domain: 'sleep', priority: 'high' })], context({ activeExperimentCount: 2, activeExperimentDomains: new Set(['sleep']) })],
      [decision(), 'none', [rec({ domain: 'education' })], context()],
      [decision(), 'none', [rec({ domain: 'coach_follow_up' })], context()],
    ];
    for (const [d, level, recs, ctx] of cases) {
      const result = classifyRouterOutcome(d, level, recs, NO_CONF, ctx);
      const lower = result.memberMessage.toLowerCase();
      for (const term of banned) expect(lower).not.toContain(term);
    }
  });
});
