/**
 * Root Map — naming the area behind "What We're Noticing Overall" (Root
 * Map redesign, 2026-07-28, Part 6). Presentation-layer only: does not
 * touch routerOutcome.ts/rootRouter.ts. The `focused_investigation`
 * outcome's fixed member message ("There's a specific area worth
 * exploring further") never named which area — this resolves a real name
 * for it from data the Root Map page already has: `domains` is already
 * sorted by builder.ts (priority desc, then confidence asc), so
 * `domains[0]` is the domain the rest of the page already treats as most
 * worth attention (RootMapDomainCard's own "Worth focused attention soon"
 * copy fires from this exact same priority value). When that top domain
 * isn't a genuine standout (`priority === 'quiet'` — every domain reads
 * this way, including all four uninstrumented ones, whenever nothing has
 * actually flagged it), there is no honest area to name, so the
 * recommendation is hidden entirely rather than naming an arbitrary
 * domain.
 */

import type { RootMapDomainView } from './types';
import type { RootRouterOutcomeView } from '../investigation-engine/routerOutcome';
import type { RecommendedInvestigationView } from '../investigation-engine/rootRouter';

export type NamedAreaRecommendation = {
  areaLabel: string;
  investigation: RecommendedInvestigationView;
};

export function resolveNamedAreaRecommendation(
  routerOutcome: RootRouterOutcomeView,
  domains: RootMapDomainView[]
): NamedAreaRecommendation | null {
  if (routerOutcome.outcome !== 'focused_investigation' || !routerOutcome.investigation) return null;

  const topDomain = domains[0];
  if (!topDomain || topDomain.priority === 'quiet') return null;

  return { areaLabel: topDomain.label, investigation: routerOutcome.investigation };
}
