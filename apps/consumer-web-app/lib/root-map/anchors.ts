/**
 * Root Map — scroll-anchor id for a domain (Root Map redesign,
 * 2026-07-28, Part 5). Deliberately its own tiny, non-'use client' module:
 * RootMapRing.tsx (a client component) and the server-rendered card
 * components (RootMapFindingCard.tsx, RootMapBuildingRow.tsx,
 * RootMapNotCoveredSection.tsx) all need the exact same id-generation
 * logic, and a plain function re-exported alongside a 'use client'
 * component is not a real, directly-callable function from server-rendered
 * code — Next.js turns it into a client reference instead, which throws
 * ("... is not a function") the moment a server component tries to call it.
 */

export function domainAnchorId(domain: string): string {
  return `root-map-domain-${domain}`;
}

/**
 * Scroll target for all four `isUninstrumented` domains. They render as
 * compact list items inside one shared "Not Covered Yet" block
 * (RootMapNotCoveredSection.tsx) — each item's own id is above, but its
 * scroll-margin only pins that item's top edge, which sits BELOW the
 * block's own "Not Covered Yet" heading. Scrolling to the block's own id
 * instead keeps the heading on screen; RootMapNotCoveredSection.tsx
 * separately highlights which specific domain was tapped (see
 * ./highlightBus.ts) so the destination is still legible.
 */
export const NOT_COVERED_SECTION_ANCHOR_ID = 'root-map-not-covered-yet';

/**
 * The page's "See all 12 areas" reveal (2026-09-05). The twelve entries
 * are present in full and folded, so the Root Map opens on the map itself
 * rather than on a page five and a half screens long.
 *
 * The ring needs this id because a tap on a segment has to OPEN the reveal
 * before it can scroll to anything inside it: a closed `<details>` lays
 * its content out nowhere, and `scrollIntoView` on it does nothing and
 * says nothing. See components/root-map/scrollToDomain.ts.
 */
export const ALL_AREAS_SECTION_ID = 'root-map-all-areas';
