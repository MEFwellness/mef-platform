/**
 * Guard tests for Root Map group assignment (Part 4). Membership must
 * come only from real fields buildRootMap() already computes
 * (`isUninstrumented`, `whatWeUnderstand`) — never a hardcoded per-domain
 * list — so a domain moves group automatically the moment it earns data.
 */
import { describe, it, expect } from 'vitest';
import { groupRootMapDomains } from '../lib/root-map/grouping';
import type { RootMapDomainView } from '../lib/root-map/types';

function domainView(overrides: Partial<RootMapDomainView> = {}): RootMapDomainView {
  return {
    domain: 'stress_nervous_system',
    label: 'Stress & Nervous System Regulation',
    definition: 'Perceived stress, regulation capacity, activation/recovery balance.',
    memberDescription: "How much pressure you're under, and how well you come down from it.",
    isUninstrumented: false,
    stage: 'discovery',
    state: 'acknowledged',
    tier: null,
    tierLabel: null,
    canonicalFindings: [],
    crossReferenced: [],
    confidence: { label: 'building', numeric: 0, corroborated: false },
    priority: 'quiet',
    whatWeUnderstand: [],
    whatWereStillLearning: 'Rooted Reset is still gathering information here.',
    currentRecommendation: 'Still gathering information',
    nextSuggestedStep: 'Complete more check-ins and assessments to build a clearer picture here.',
    patterns: [],
    ...overrides,
  };
}

describe('groupRootMapDomains', () => {
  it('puts an uninstrumented domain in notCovered regardless of any findings it might carry', () => {
    const domain = domainView({ domain: 'purpose_motivation', isUninstrumented: true });
    const groups = groupRootMapDomains([domain]);
    expect(groups.notCovered).toEqual([domain]);
    expect(groups.seeing).toEqual([]);
    expect(groups.building).toEqual([]);
  });

  it('puts an instrumented domain with no earned finding in building', () => {
    const domain = domainView({ isUninstrumented: false, whatWeUnderstand: [] });
    const groups = groupRootMapDomains([domain]);
    expect(groups.building).toEqual([domain]);
    expect(groups.seeing).toEqual([]);
  });

  it('puts an instrumented domain with a real earned finding in seeing', () => {
    const domain = domainView({ isUninstrumented: false, whatWeUnderstand: ['Elevated stress this week.'] });
    const groups = groupRootMapDomains([domain]);
    expect(groups.seeing).toEqual([domain]);
    expect(groups.building).toEqual([]);
  });

  it('moves a domain from building to seeing automatically once whatWeUnderstand gains an entry — group membership is computed, not fixed', () => {
    const before = domainView({ whatWeUnderstand: [] });
    const after = domainView({ whatWeUnderstand: ['A new finding just landed.'] });

    expect(groupRootMapDomains([before]).building).toEqual([before]);
    expect(groupRootMapDomains([before]).seeing).toEqual([]);

    expect(groupRootMapDomains([after]).seeing).toEqual([after]);
    expect(groupRootMapDomains([after]).building).toEqual([]);
  });
});
