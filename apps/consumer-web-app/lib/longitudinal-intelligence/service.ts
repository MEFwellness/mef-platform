/**
 * Longitudinal Intelligence — orchestration (Prompt 12, Part 1). Gathers
 * already-computed inputs (registry findings via buildFindingTimeline(),
 * check-in metric trends via classifyAllMetricTrends(), and this member's
 * own previously-persisted signal states) and produces the refreshed
 * LongitudinalSignal[] the rest of Prompt 12 reads — Root Router adaptive
 * decisions (routerOutcome.ts), member-facing copy (app/insights), and the
 * coach panel (LongitudinalIntelligencePanel.tsx).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listRegistryEntriesForMember } from '../registry/data';
import { buildFindingTimeline } from '../registry/timeline';
import { classifyAllMetricTrends } from '../intelligence/trendEngine';
import { listRecentCheckinsForMember } from '../coaching-engine/data';
import { LONGITUDINAL_METRIC_AREAS } from '../intelligence-engine/types';
import {
  COACHING_DOMAIN_TO_REGISTRY_DOMAIN,
  COACHING_DOMAIN_TO_WELLNESS_METRIC,
  COACHING_DOMAINS,
} from '../investigation-engine/domains';
import {
  classifyCheckinMetricSignal,
  classifyRegistryFindingSignal,
  detectConflictingSignals,
} from './signalState';
import { listMemberPatternStates, upsertMemberPatternState } from './data';
import type { LongitudinalSignal } from './types';

/** signal_key -> CoachingDomain, for the cross-signal conflict check — built once from the same reconciliation tables domains.ts already exports (Method Recommendation 1: never a second stored vocabulary). */
function buildDomainLookup(): (signalKey: string) => string | null {
  const registryDomainToCoaching = new Map<string, string>();
  const wellnessMetricToCoaching = new Map<string, string>();

  for (const { domain } of COACHING_DOMAINS) {
    for (const registryDomain of COACHING_DOMAIN_TO_REGISTRY_DOMAIN[domain]) {
      if (!registryDomainToCoaching.has(registryDomain)) registryDomainToCoaching.set(registryDomain, domain);
    }
    for (const metric of COACHING_DOMAIN_TO_WELLNESS_METRIC[domain]) {
      if (!wellnessMetricToCoaching.has(metric)) wellnessMetricToCoaching.set(metric, domain);
    }
  }

  return (signalKey: string) => {
    if (signalKey.startsWith('registry::')) {
      const registryDomain = signalKey.split('::')[1]!;
      return registryDomainToCoaching.get(registryDomain) ?? null;
    }
    if (signalKey.startsWith('checkin_metric::')) {
      const metric = signalKey.split('::')[1]!;
      return wellnessMetricToCoaching.get(metric) ?? null;
    }
    return null;
  };
}

/**
 * Recomputes every longitudinal signal for a member and persists the
 * refreshed state (member_pattern_states) — same "recompute cheap, persist
 * state" discipline as recomputeAndPersist in app/actions/recommendations.ts.
 * Best-effort per signal: one failed upsert never blocks the others.
 */
export async function computeLongitudinalSignals(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<LongitudinalSignal[]> {
  const [allEntries, checkins, priorStates] = await Promise.all([
    listRegistryEntriesForMember(supabase, memberId),
    listRecentCheckinsForMember(supabase, memberId, asOfLocalDate, 90),
    listMemberPatternStates(supabase, memberId),
  ]);

  const now = new Date();
  const timeline = buildFindingTimeline(allEntries);
  const registrySignals = timeline.map((entry) => classifyRegistryFindingSignal(entry, now));

  const trendDrafts = classifyAllMetricTrends(checkins, asOfLocalDate, LONGITUDINAL_METRIC_AREAS);
  const draftByArea = new Map(trendDrafts.map((d) => [d.wellnessArea, d]));
  const checkinSignals = LONGITUDINAL_METRIC_AREAS.map((area) => {
    const signalKey = `checkin_metric::${area}`;
    const priorRow = priorStates.get(signalKey) ?? null;
    return classifyCheckinMetricSignal(area, draftByArea.get(area) ?? null, priorRow, asOfLocalDate);
  });

  const domainForSignalKey = buildDomainLookup();
  const signals = detectConflictingSignals([...registrySignals, ...checkinSignals], domainForSignalKey);

  await Promise.all(signals.map((signal) => upsertMemberPatternState(supabase, memberId, signal)));

  return signals;
}
