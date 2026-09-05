/**
 * Root Map — what a segment IS, and what colour it takes.
 *
 * FACTORED OUT OF RootMapRing.tsx, NOT REWRITTEN (2026-09-05), for the
 * same reason ./scrollToDomain.ts was: the numbered key that names the
 * segments now renders in a different component from the ring that draws
 * them, and both have to answer "is this one gold" with the same function.
 * Two copies of that predicate would be two definitions of what gold
 * means, which is precisely what the colour key under the ring promises
 * there is only one of.
 *
 * Both functions are byte-for-byte the ones RootMapRing already shipped,
 * and RootMapRing still re-exports them, so every existing caller and
 * every existing test reaches the identical function at the identical
 * name.
 *
 * WHAT THEY ENCODE, stated once because the colour key on the screen is
 * written to match it: gold means this domain already has a real earned
 * finding; deep green means it does not yet, and the arc's length is how
 * many of the last `windowDays` were logged. An instrumented domain still
 * building coverage and a domain with no tracker at all are both green.
 */

import type { CoachingDomain } from '@/lib/investigation-engine/domains';
import type { DomainCoverage } from '@/lib/root-map';

const DEEP_GREEN = '#1B3A2D';
const GOLD = '#F5B700';

/**
 * Only what the ring and its key actually need to draw and label
 * themselves — never the full RootMapDomainView. That view carries
 * `definition`, the coach-only third-person text, and passing the whole
 * object into a 'use client' component would serialize it into the member
 * page's own RSC payload even though nothing renders it.
 */
export type RingDomain = {
  domain: CoachingDomain;
  label: string;
  whatWeUnderstand: unknown[];
  isUninstrumented: boolean;
};

export function fillFractionFor(domain: RingDomain, coverage: DomainCoverage | undefined): number {
  if (domain.whatWeUnderstand.length > 0) return 1;
  if (!coverage || coverage.windowDays === 0) return 0;
  return Math.max(0, Math.min(1, coverage.count / coverage.windowDays));
}

export function colorFor(domain: RingDomain): string {
  return domain.whatWeUnderstand.length > 0 ? GOLD : DEEP_GREEN;
}

/**
 * How many of her areas have a real earned finding behind them.
 *
 * The orientation line above the entries is the only thing that reads
 * this, and it reads it rather than counting gold pixels or trusting a
 * separate query: the number a member is told is the number the ring drew,
 * from the same predicate, or it is not said at all.
 */
export function noticedDomainCount(domains: readonly RingDomain[]): number {
  return domains.filter((domain) => colorFor(domain) === GOLD).length;
}

export { DEEP_GREEN as ROOT_MAP_GREEN, GOLD as ROOT_MAP_GOLD };
