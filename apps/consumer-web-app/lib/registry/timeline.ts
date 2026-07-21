/**
 * Pattern Timeline (Prompt 6) — a longitudinal read over one (member,
 * domain, code) finding's whole supersede chain in registry_entries.
 * Pure, no I/O: pass in every entry for a member (all statuses — the
 * chain includes superseded/resolved/dismissed rows, not just the current
 * active one), already fetched via lib/registry/data.ts's
 * listRegistryEntriesForMember (which applies no status filter by
 * default). Nothing here is a new persisted table — the chain itself
 * already "never overwrites history" by construction (supersedes_id /
 * superseded_by_id, migration 40), so the timeline is a computed view over
 * data that already exists, exactly like every other "recomputation is
 * cheap" derived read in this codebase (lib/intelligence-engine/,
 * lib/scoring/).
 */

import type { RegistryEntry } from '@mef/shared-types-contracts';

export type FindingTimelineEntry = {
  domain: RegistryEntry['domain'];
  code: string;
  label: string;
  firstObservedAt: string;
  lastObservedAt: string;
  occurrenceCount: number;
  currentStatus: RegistryEntry['status'];
  currentTrendStatus: RegistryEntry['trend_status'];
  resolvedAt: string | null;
  confidenceOverTime: {
    recordedAt: string;
    confidence: number;
    severity: RegistryEntry['severity'];
  }[];
};

export function buildFindingTimeline(entries: RegistryEntry[]): FindingTimelineEntry[] {
  const byKey = new Map<string, RegistryEntry[]>();
  for (const entry of entries) {
    const key = `${entry.domain}::${entry.code}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(entry);
    else byKey.set(key, [entry]);
  }

  const timeline: FindingTimelineEntry[] = [];
  for (const chain of byKey.values()) {
    const chronological = [...chain].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    const latest = chronological[chronological.length - 1]!;
    const resolved = chronological.find((e) => e.status === 'resolved' || e.severity === 'none');

    timeline.push({
      domain: latest.domain,
      code: latest.code,
      label: latest.label,
      firstObservedAt: chronological[0]!.recorded_at,
      lastObservedAt: latest.recorded_at,
      occurrenceCount: chronological.length,
      currentStatus: latest.status,
      currentTrendStatus: latest.trend_status,
      resolvedAt: resolved?.recorded_at ?? null,
      confidenceOverTime: chronological.map((e) => ({
        recordedAt: e.recorded_at,
        confidence: e.confidence,
        severity: e.severity,
      })),
    });
  }

  return timeline.sort((a, b) => b.lastObservedAt.localeCompare(a.lastObservedAt));
}
