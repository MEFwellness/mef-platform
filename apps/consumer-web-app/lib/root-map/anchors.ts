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
