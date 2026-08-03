/**
 * Root Presence System (Prompt 4), requirement 6: Discovery Moments.
 * Computes no correlation, no trend, no driver state — reuses the exact
 * same real, already-gated read path Case View's own findings list uses
 * (lib/case-view/findings.ts's buildFindings, fed by the correlation
 * engine's own persisted member_pattern_states rows), then layers a thin
 * "have I announced this one yet" filter on top. The correlation engine
 * itself is never touched by this file.
 *
 * Gated to tier >= 2 ("repeated_signal" or stronger) — the same bar
 * lib/intelligence-engine/correlationPatterns.ts already uses to decide a
 * finding is "a pattern," not a lone, too-weak-to-announce one-time
 * observation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchLatestMemberGoalSelection } from '../member-goals/data';
import { listActiveCandidatePairs } from '../correlation-engine/data';
import { listMemberPatternStates } from '../longitudinal-intelligence/data';
import { buildFindings } from '../case-view/findings';
import type { FindingView } from '../case-view/types';
import { selectDiscoveryCandidate, discoverySignalKey } from './select';
import { listSurfacedDiscoverySignalKeys, markDiscoverySurfaced } from './data';

/** The single newest real finding the member hasn't been shown as a discovery yet, or null when there isn't one — silence-until-evidence, same as every other engine-adjacent read in this app. Never mutates anything; call markDiscoveryCandidateSurfaced separately once the caller has actually decided to show it. */
export async function findNewDiscoveryCandidate(
  supabase: SupabaseClient,
  memberId: string
): Promise<FindingView | null> {
  const goalSelection = await fetchLatestMemberGoalSelection(supabase, memberId);
  const memberGoalKeys = goalSelection?.goals ?? [];

  const [candidatePairs, patternStates, surfacedKeys] = await Promise.all([
    listActiveCandidatePairs(supabase),
    listMemberPatternStates(supabase, memberId),
    listSurfacedDiscoverySignalKeys(supabase, memberId),
  ]);

  const findings = buildFindings([...patternStates.values()], candidatePairs, memberGoalKeys);

  return selectDiscoveryCandidate(findings, surfacedKeys);
}

export async function markDiscoveryCandidateSurfaced(
  supabase: SupabaseClient,
  memberId: string,
  finding: FindingView
): Promise<void> {
  await markDiscoverySurfaced(supabase, memberId, discoverySignalKey(finding));
}
