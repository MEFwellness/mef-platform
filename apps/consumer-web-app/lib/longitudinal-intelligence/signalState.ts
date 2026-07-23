/**
 * Longitudinal Intelligence — pure signal-state classification (Prompt 12,
 * Part 1). No I/O, no new confidence math: every function here composes
 * already-computed outputs —
 * lib/registry/timeline.ts's buildFindingTimeline() for registry findings,
 * lib/intelligence/trendEngine.ts's classifyMetricTrend() for check-in
 * metrics — into the eleven-value SignalState vocabulary (types.ts).
 * Thresholds are imported from lib/intelligence/confidence.ts, never
 * redefined here.
 */

import type { FindingTimelineEntry } from '../registry/timeline';
import type { WellnessInsightDraft } from '../intelligence/types';
import type { WellnessMetricKey } from '../wellness/wellness-index';
import { MIN_CONFIDENCE_TO_PERSIST } from '../intelligence/confidence';
import type { LongitudinalSignal, LongitudinalSignalRow, SignalState } from './types';

/**
 * A signal untouched this long is presented as stale rather than under its
 * last-computed direction — same order of magnitude as
 * RECOMMENDATION_STALE_DAYS (lib/recommendation-engine/lifecycle.ts),
 * applied one layer earlier: a stale finding shouldn't keep driving a
 * "worsening" read forever just because nothing has superseded it.
 */
export const SIGNAL_STALE_DAYS = 30;

/** An occurrence chain needs to span at least this many days, in addition to 3+ occurrences, before it's presented as "established" rather than merely "emerging" — a pattern needs real time elapsed, not just three closely-spaced data points. */
export const ESTABLISHED_MIN_SPAN_DAYS = 21;

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (24 * 60 * 60 * 1000);
}

function isStale(lastObservedAt: string, asOf: Date): boolean {
  return daysBetween(lastObservedAt, asOf.toISOString()) > SIGNAL_STALE_DAYS;
}

/**
 * Registry-finding axis — occurrence (one-time -> repeated -> emerging ->
 * established) combined with the finding's own already-computed
 * trend_status (lib/registry/trendStatus.ts). Precedence: staleness first
 * (a stale finding is presented as stale regardless of what it used to
 * say), then resolved, then the occurrence/direction blend.
 */
export function classifyRegistryFindingSignal(
  entry: FindingTimelineEntry,
  asOf: Date
): LongitudinalSignal {
  const signalKey = `registry::${entry.domain}::${entry.code}`;
  const base = {
    signalKey,
    signalKind: 'registry_finding' as const,
    signalLabel: entry.label,
    occurrenceCount: entry.occurrenceCount,
    firstObservedAt: entry.firstObservedAt,
    lastObservedAt: entry.lastObservedAt,
    evidenceSummary: { code: entry.code, domain: entry.domain },
  };

  const latestConfidence = entry.confidenceOverTime[entry.confidenceOverTime.length - 1]?.confidence ?? 0;

  if (isStale(entry.lastObservedAt, asOf)) {
    return { ...base, state: 'stale', tier: null, confidence: latestConfidence };
  }

  if (entry.resolvedAt || entry.currentTrendStatus === 'resolved') {
    return { ...base, state: 'resolved', tier: 2, confidence: latestConfidence };
  }

  const spanDays = daysBetween(entry.firstObservedAt, entry.lastObservedAt);
  const established =
    entry.occurrenceCount >= 3 &&
    spanDays >= ESTABLISHED_MIN_SPAN_DAYS &&
    latestConfidence >= MIN_CONFIDENCE_TO_PERSIST;

  if (established) {
    if (entry.currentTrendStatus === 'worsening') {
      return { ...base, state: 'worsening', tier: 3, confidence: latestConfidence };
    }
    if (entry.currentTrendStatus === 'improving') {
      return { ...base, state: 'improving', tier: 3, confidence: latestConfidence };
    }
    if (entry.currentTrendStatus === 'stable') {
      return { ...base, state: 'stable', tier: 3, confidence: latestConfidence };
    }
    return { ...base, state: 'established_pattern', tier: 3, confidence: latestConfidence };
  }

  if (entry.occurrenceCount === 1) {
    return { ...base, state: 'one_time_observation', tier: 1, confidence: latestConfidence };
  }
  if (entry.occurrenceCount === 2) {
    return { ...base, state: 'repeated_signal', tier: 2, confidence: latestConfidence };
  }
  return { ...base, state: 'emerging_pattern', tier: 2, confidence: latestConfidence };
}

/**
 * Check-in-metric axis — classifyMetricTrend()'s own WellnessTrendState
 * vocabulary (recurring_pattern/newly_emerging/declining/improving/
 * inconsistent/stable/null) mapped onto the shared eleven-value
 * SignalState. `priorRow` (this signal's own last-persisted state, if any)
 * is what lets a run-to-run-unchanged classification count as growing
 * "occurrence" — check-ins don't have a discrete occurrenceCount the way a
 * registry finding chain does, so persistence across recompute runs is the
 * closest real equivalent to "this keeps showing up."
 */
export function classifyCheckinMetricSignal(
  area: WellnessMetricKey,
  draft: WellnessInsightDraft | null,
  priorRow: Pick<LongitudinalSignalRow, 'state' | 'occurrenceCount' | 'firstObservedAt'> | null,
  asOfLocalDate: string
): LongitudinalSignal {
  const signalKey = `checkin_metric::${area}`;
  const base = {
    signalKey,
    signalKind: 'checkin_metric' as const,
    signalLabel: area,
    lastObservedAt: asOfLocalDate,
    evidenceSummary: { area },
  };

  if (!draft || draft.trendState === null) {
    return {
      ...base,
      state: 'insufficient_data',
      tier: 1,
      confidence: 0,
      occurrenceCount: 0,
      firstObservedAt: priorRow?.firstObservedAt ?? asOfLocalDate,
    };
  }

  const MAPPED: Record<NonNullable<WellnessInsightDraft['trendState']>, SignalState> = {
    recurring_pattern: 'established_pattern',
    declining: 'worsening',
    improving: 'improving',
    inconsistent: 'conflicting',
    stable: 'stable',
    newly_emerging: 'one_time_observation',
    resolved_or_inactive: 'resolved',
    // classifyMetricTrend() never actually returns this literal (it returns
    // a null draft instead, handled above) — included only because
    // WellnessTrendState's own type includes it as a member, so this map
    // stays exhaustively typed.
    insufficient_data: 'insufficient_data',
  };

  const state = MAPPED[draft.trendState];

  // Persistence-based occurrence: a state that matches the last computed
  // run for this same signal counts as one more occurrence; a changed
  // state resets to a fresh occurrence of 1 — never inferred from
  // anything not already stored.
  const occurrenceCount = priorRow && priorRow.state === state ? priorRow.occurrenceCount + 1 : 1;
  const firstObservedAt = priorRow && priorRow.state === state ? priorRow.firstObservedAt : asOfLocalDate;

  // 'conflicting'/'insufficient_data' never carry a tier; 'established_pattern'/'worsening'/'improving'/'stable' only reach tier 3 once this same read has persisted across recompute runs, mirroring the registry-finding axis's span requirement.
  let tier: 1 | 2 | 3 | null;
  if (state === 'conflicting') tier = null;
  else if (occurrenceCount === 1) tier = 1;
  else if (occurrenceCount === 2 || draft.confidence < MIN_CONFIDENCE_TO_PERSIST) tier = 2;
  else tier = 3;

  return {
    ...base,
    state,
    tier,
    confidence: draft.confidence,
    occurrenceCount,
    firstObservedAt,
  };
}

/**
 * Part 1's "conflicting information" cross-check: when a registry-finding
 * signal and a check-in-metric signal that map to the same coaching domain
 * disagree on direction (one improving, the other worsening) in the same
 * computation pass, both are re-labeled 'conflicting' — reading two
 * already-computed classifications against each other, introducing no
 * third scoring formula. Mutates neither input; returns a new array.
 */
export function detectConflictingSignals(
  signals: LongitudinalSignal[],
  domainForSignalKey: (signalKey: string) => string | null
): LongitudinalSignal[] {
  const byDomain = new Map<string, LongitudinalSignal[]>();
  for (const signal of signals) {
    const domain = domainForSignalKey(signal.signalKey);
    if (!domain) continue;
    const bucket = byDomain.get(domain);
    if (bucket) bucket.push(signal);
    else byDomain.set(domain, [signal]);
  }

  const conflictingKeys = new Set<string>();
  for (const bucket of byDomain.values()) {
    const worsening = bucket.filter((s) => s.state === 'worsening');
    const improving = bucket.filter((s) => s.state === 'improving');
    if (worsening.length > 0 && improving.length > 0) {
      for (const s of [...worsening, ...improving]) conflictingKeys.add(s.signalKey);
    }
  }

  if (conflictingKeys.size === 0) return signals;

  return signals.map((s) =>
    conflictingKeys.has(s.signalKey)
      ? { ...s, state: 'conflicting' as const, tier: null, evidenceSummary: { ...s.evidenceSummary, wasConflictOverride: true } }
      : s
  );
}
