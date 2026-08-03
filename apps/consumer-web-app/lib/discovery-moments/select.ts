/**
 * Pure selection logic for Discovery Moments (Root Presence System,
 * Prompt 4, requirement 6) — split out from service.ts's I/O so the
 * "which finding, if any, counts as a genuinely new discovery" decision
 * is directly unit-testable with no database involved. Computes no
 * correlation, no trend, no driver state — only decides which of an
 * already-computed FindingView[] (Case View's own buildFindings output)
 * is new enough to announce.
 */

import type { FindingView } from '../case-view/types';

/** tier >= 2 ("repeated_signal" or stronger) — the same bar lib/intelligence-engine/correlationPatterns.ts already uses to call a finding "a pattern," not a lone, too-weak-to-announce one-time observation. */
export const DISCOVERY_MIN_TIER = 2;

export function discoverySignalKey(finding: Pick<FindingView, 'pairKey'>): string {
  return `correlation::${finding.pairKey}`;
}

/** The single newest real finding not yet in `surfacedSignalKeys`, or null when there isn't one. Never mutates `surfacedSignalKeys` — the caller decides when/whether to actually record a surfacing. */
export function selectDiscoveryCandidate(
  findings: readonly FindingView[],
  surfacedSignalKeys: ReadonlySet<string>
): FindingView | null {
  const candidates = findings
    .filter((f) => f.tier >= DISCOVERY_MIN_TIER && !surfacedSignalKeys.has(discoverySignalKey(f)))
    .sort((a, b) => (a.computedAt < b.computedAt ? 1 : -1));

  return candidates[0] ?? null;
}
