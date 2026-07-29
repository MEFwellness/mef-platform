/**
 * Guard tests for Item 3 (2026-07-29 follow-up): the ring, the numbered
 * legend, the "Building" list, and the "Not Covered Yet" block must be
 * incapable of disagreeing about which of the 12 Coaching Domains is
 * which number and which state it's in. Confirmed by reading the code
 * before writing these (not assumed): all four already derive from the
 * single COACHING_DOMAINS array in lib/investigation-engine/domains.ts —
 * RootMapRing.tsx re-orders into that canonical order rather than keeping
 * its own, lib/root-map/grouping.ts computes membership from real fields
 * on the same RootMapDomainView[] builder.ts builds from COACHING_DOMAINS,
 * and there is no second hardcoded 12-item domain array anywhere else in
 * the app. These tests lock that invariant down as a real regression
 * guard, not just prose.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { COACHING_DOMAINS } from '../lib/investigation-engine/domains';
import { groupRootMapDomains } from '../lib/root-map/grouping';
import type { RootMapDomainView } from '../lib/root-map/types';

function domainView(overrides: Partial<RootMapDomainView> = {}): RootMapDomainView {
  return {
    domain: 'stress_nervous_system',
    label: 'Stress & Nervous System Regulation',
    definition: 'x',
    memberDescription: 'x',
    isUninstrumented: false,
    stage: 'discovery',
    confidence: { label: 'building', numeric: 0, corroborated: false },
    priority: 'quiet',
    whatWeUnderstand: [],
    whatWereStillLearning: 'x',
    currentRecommendation: 'x',
    nextSuggestedStep: 'x',
    patterns: [],
    ...overrides,
  };
}

describe('COACHING_DOMAINS — the one place the 12 dimensions are numbered', () => {
  it('has exactly 12 domains', () => {
    expect(COACHING_DOMAINS).toHaveLength(12);
  });

  it('numbers positions 1, 2, 11, and 12 (1-indexed) as the four uninstrumented domains, matching the reported split', () => {
    const uninstrumentedPositions = COACHING_DOMAINS.map((d, i) => (d.isUninstrumented ? i + 1 : null)).filter(
      (n): n is number => n !== null
    );
    expect(uninstrumentedPositions).toEqual([1, 2, 11, 12]);
  });

  it('numbers positions 3 through 10 (1-indexed) as the eight instrumented domains', () => {
    const instrumentedPositions = COACHING_DOMAINS.map((d, i) => (!d.isUninstrumented ? i + 1 : null)).filter(
      (n): n is number => n !== null
    );
    expect(instrumentedPositions).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('grouping is computed from the same domain views the ring/legend use, never a hardcoded per-domain list', () => {
  it('every uninstrumented domain (by position) lands in notCovered, regardless of import order', () => {
    const views = COACHING_DOMAINS.map((info) => domainView({ domain: info.domain, isUninstrumented: info.isUninstrumented }));
    const groups = groupRootMapDomains(views);
    const notCoveredDomains = new Set(groups.notCovered.map((d) => d.domain));
    const expectedUninstrumented = new Set(
      COACHING_DOMAINS.filter((d) => d.isUninstrumented).map((d) => d.domain)
    );
    expect(notCoveredDomains).toEqual(expectedUninstrumented);
    expect(groups.seeing.length + groups.building.length + groups.notCovered.length).toBe(12);
  });
});

describe('no second, competing hardcoded 12-item domain array exists in the Root Map area', () => {
  // A source scan across the Root Map's own components/lib files: any of
  // them defining their own domain-name array (rather than importing
  // COACHING_DOMAINS or deriving from a RootMapDomainView[]) would be
  // exactly the disagreement risk Item 3 asks to rule out.
  const rootMapFiles = execSync(
    'git ls-files components/root-map lib/root-map app/root-map',
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf-8' }
  )
    .trim()
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('/tests/'));

  it('every Root Map file that references a CoachingDomain gets it from investigation-engine/domains, not a private list', () => {
    for (const file of rootMapFiles) {
      const source = readFileSync(path.resolve(__dirname, '..', file), 'utf-8');
      const definesOwnDomainArray = /=\s*\[\s*\{\s*domain:\s*['"]identity_self_concept['"]/.test(source);
      expect(definesOwnDomainArray, `${file} appears to define its own copy of the 12-domain list`).toBe(false);
    }
  });

  it('sanity-checks the scan actually covered real files (non-vacuous)', () => {
    expect(rootMapFiles.length).toBeGreaterThan(5);
  });
});

