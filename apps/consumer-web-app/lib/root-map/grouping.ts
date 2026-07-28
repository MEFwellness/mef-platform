/**
 * Root Map — grouping dimensions by real state (Root Map redesign,
 * 2026-07-28, Part 4). Membership is computed only from fields
 * builder.ts already derives from real data — never hardcoded per
 * domain, so a domain moves group automatically once it earns data:
 *
 *  - "seeing": `whatWeUnderstand.length > 0` — buildDomainView only
 *    populates this from active, member-visible Universal Registry
 *    findings that actually matched this domain's vocabulary
 *    (matchingFindings in builder.ts). This is the Root Map's own
 *    existing "real earned finding" concept — the Root Map does not
 *    currently read the three-tier correlation/pattern-state engine at
 *    all (confirmed by re-reading app/actions/rootMap.ts's
 *    gatherRootMapInputs), so wiring that in here would be new plumbing
 *    into an explicitly off-limits system, not a presentation change.
 *  - "notCovered": `isUninstrumented` — the four domains with no
 *    assessment behind them at all (Method §5).
 *  - "building": everything else — instrumented, but no earned finding
 *    yet.
 */

import type { RootMapDomainView } from './types';

export type RootMapGroups = {
  seeing: RootMapDomainView[];
  building: RootMapDomainView[];
  notCovered: RootMapDomainView[];
};

export function groupRootMapDomains(domains: RootMapDomainView[]): RootMapGroups {
  const seeing: RootMapDomainView[] = [];
  const building: RootMapDomainView[] = [];
  const notCovered: RootMapDomainView[] = [];

  for (const domain of domains) {
    if (domain.isUninstrumented) {
      notCovered.push(domain);
    } else if (domain.whatWeUnderstand.length > 0) {
      seeing.push(domain);
    } else {
      building.push(domain);
    }
  }

  return { seeing, building, notCovered };
}
